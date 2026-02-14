/**
 * Container/Process Runner for NanoClaw
 * Supports both Docker container isolation and child process execution
 */
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  AGENT_EXECUTION_MODE,
  CONTAINER_IMAGE,
  CONTAINER_TIMEOUT,
  DATA_DIR,
  GROUPS_DIR,
  MOUNT_ALLOWLIST_PATH,
} from './config.js';
import { logger } from './logger.js';
import { loadMountAllowlist } from './mount-security.js';
import { RegisteredGroup } from './types.js';

// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

// Max output size per stream (1MB)
const MAX_OUTPUT_SIZE = 1024 * 1024;

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
}

export interface AgentResponse {
  outputType: 'message' | 'log';
  userMessage?: string;
  internalLog?: string;
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: AgentResponse | null;
  newSessionId?: string;
  error?: string;
}

/**
 * Prepare environment variables for agent process/container
 */
function buildAgentEnv(group: RegisteredGroup): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
  };

  // Pass through Azure OpenAI credentials
  const allowedVars = [
    'AZURE_ENDPOINT',
    'AZURE_API_KEY',
    'AZURE_API_VERSION',
    'AZURE_DEPLOYMENT_NAME',
    'TEMPERATURE',
    'GOOGLE_API_KEY',
    'GOOGLE_SEARCH_ENGINE_ID',
  ];

  for (const varName of allowedVars) {
    if (process.env[varName]) {
      env[varName] = process.env[varName];
    }
  }

  return env;
}

/**
 * Build Docker volume mounts for container execution
 */
function buildVolumeMounts(group: RegisteredGroup): string[] {
  const volumes: string[] = [
    `${path.join(GROUPS_DIR, group.folder)}:/workspace:rw`,
    `${path.join(DATA_DIR, 'ipc', group.folder)}:/ipc:ro`,
    `${path.join(DATA_DIR, 'sessions', group.folder)}:/sessions:rw`,
  ];

  // Add user-defined mounts from allowlist
  if (fs.existsSync(MOUNT_ALLOWLIST_PATH)) {
    const allowlist = loadMountAllowlist();
    for (const mount of allowlist) {
      if (mount.enabled) {
        const mode = mount.readOnly ? 'ro' : 'rw';
        volumes.push(`${mount.hostPath}:${mount.containerPath}:${mode}`);
      }
    }
  }

  return volumes;
}

/**
 * Run agent in Docker container (secure isolation)
 */
async function runDockerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, processId: string) => void,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  // Ensure IPC and sessions directories exist
  const groupIpcDir = path.join(DATA_DIR, 'ipc', group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });

  const groupSessionsDir = path.join(DATA_DIR, 'sessions', group.folder, '.claude');
  fs.mkdirSync(groupSessionsDir, { recursive: true });

  const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const processId = `nanoclaw-docker-${safeName}-${Date.now()}`;

  const volumes = buildVolumeMounts(group);
  const env = buildAgentEnv(group);

  // Build docker run command
  const dockerArgs = [
    'run',
    '--rm',
    '--name', processId,
    '--network', 'none', // No network access by default
    '--memory', '512m', // Memory limit
    '--cpus', '1', // CPU limit
    '-w', '/workspace',
    '-i', // Interactive for stdin
  ];

  // Add volume mounts
  for (const vol of volumes) {
    dockerArgs.push('-v', vol);
  }

  // Add environment variables
  for (const [key, value] of Object.entries(env)) {
    if (value) {
      dockerArgs.push('-e', `${key}=${value}`);
    }
  }

  dockerArgs.push(CONTAINER_IMAGE);

  logger.info(
    {
      group: group.name,
      processId,
      isMain: input.isMain,
      image: CONTAINER_IMAGE,
      volumeCount: volumes.length,
    },
    'Spawning Docker container',
  );

  const logsDir = path.join(GROUPS_DIR, group.folder, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    const containerProcess = spawn('docker', dockerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    onProcess(containerProcess, processId);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    containerProcess.stdin.write(JSON.stringify(input));
    containerProcess.stdin.end();

    containerProcess.stdout.on('data', (data) => {
      if (stdoutTruncated) return;
      const chunk = data.toString();
      const remaining = MAX_OUTPUT_SIZE - stdout.length;
      if (chunk.length > remaining) {
        stdout += chunk.slice(0, remaining);
        stdoutTruncated = true;
        logger.warn(
          { group: group.name, size: stdout.length },
          'Docker container stdout truncated',
        );
      } else {
        stdout += chunk;
      }
    });

    containerProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ process: group.folder }, line);
      }
      if (stderrTruncated) return;
      const remaining = MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
        logger.warn(
          { group: group.name, size: stderr.length },
          'Docker container stderr truncated',
        );
      } else {
        stderr += chunk;
      }
    });

    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      logger.error({ group: group.name, processId }, 'Container timeout, killing');
      spawn('docker', ['kill', processId]);
    }, group.containerConfig?.timeout || CONTAINER_TIMEOUT);

    containerProcess.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      if (timedOut) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const timeoutLog = path.join(logsDir, `docker-${ts}.log`);
        fs.writeFileSync(timeoutLog, [
          `=== Docker Container Log (TIMEOUT) ===`,
          `Timestamp: ${new Date().toISOString()}`,
          `Group: ${group.name}`,
          `Container ID: ${processId}`,
          `Duration: ${duration}ms`,
          `Exit Code: ${code}`,
        ].join('\n'));

        logger.error(
          { group: group.name, processId, duration, code },
          'Docker container timed out',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container timed out after ${group.containerConfig?.timeout || CONTAINER_TIMEOUT}ms`,
        });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `docker-${timestamp}.log`);
      const isVerbose =
        process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace';

      const logLines = [
        `=== Docker Container Log ===`,
        `Timestamp: ${new Date().toISOString()}`,
        `Group: ${group.name}`,
        `Container: ${processId}`,
        `IsMain: ${input.isMain}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${code}`,
        `Stdout Truncated: ${stdoutTruncated}`,
        `Stderr Truncated: ${stderrTruncated}`,
        ``,
      ];

      const isError = code !== 0;

      if (isVerbose || isError) {
        logLines.push(
          `=== Input ===`,
          JSON.stringify(input, null, 2),
          ``,
          `=== Stderr${stderrTruncated ? ' (TRUNCATED)' : ''} ===`,
          stderr,
          ``,
          `=== Stdout${stdoutTruncated ? ' (TRUNCATED)' : ''} ===`,
          stdout,
        );
      } else {
        logLines.push(
          `=== Input Summary ===`,
          `Prompt length: ${input.prompt.length} chars`,
          `Session ID: ${input.sessionId || 'new'}`,
          ``,
        );
      }

      fs.writeFileSync(logFile, logLines.join('\n'));
      logger.debug({ logFile, verbose: isVerbose }, 'Docker log written');

      if (code !== 0) {
        logger.error(
          {
            group: group.name,
            code,
            duration,
            stderr,
            stdout,
            logFile,
          },
          'Docker container exited with error',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      try {
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }

        const output: ContainerOutput = JSON.parse(jsonLine);

        logger.info(
          {
            group: group.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          'Docker container completed',
        );

        resolve(output);
      } catch (err) {
        logger.error(
          {
            group: group.name,
            stdout,
            stderr,
            error: err,
          },
          'Failed to parse Docker output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse Docker output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    containerProcess.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ group: group.name, processId, error: err }, 'Docker spawn error');
      resolve({
        status: 'error',
        result: null,
        error: `Docker spawn error: ${err.message}`,
      });
    });
  });
}

/**
 * Run agent as Node.js child process (simpler, no isolation)
 */
async function runProcessAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, processId: string) => void,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  // Ensure IPC and sessions directories exist
  const groupIpcDir = path.join(DATA_DIR, 'ipc', group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });

  const groupSessionsDir = path.join(DATA_DIR, 'sessions', group.folder, '.claude');
  fs.mkdirSync(groupSessionsDir, { recursive: true });

  const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const processId = `nanoclaw-${safeName}-${Date.now()}`;
  
  const agentPath = path.join(process.cwd(), 'container/agent-runner/dist/index.js');
  const env = buildAgentEnv(group);

  logger.info(
    {
      group: group.name,
      processId,
      isMain: input.isMain,
      agentPath,
    },
    'Spawning agent process',
  );

  const logsDir = path.join(GROUPS_DIR, group.folder, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    const agentProcess = spawn('node', [agentPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: groupDir,
      env,
    });

    onProcess(agentProcess, processId);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    agentProcess.stdin.write(JSON.stringify(input));
    agentProcess.stdin.end();

    agentProcess.stdout.on('data', (data) => {
      if (stdoutTruncated) return;
      const chunk = data.toString();
      const remaining = MAX_OUTPUT_SIZE - stdout.length;
      if (chunk.length > remaining) {
        stdout += chunk.slice(0, remaining);
        stdoutTruncated = true;
        logger.warn(
          { group: group.name, size: stdout.length },
          'Agent stdout truncated due to size limit',
        );
      } else {
        stdout += chunk;
      }
    });

    agentProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ process: group.folder }, line);
      }
      if (stderrTruncated) return;
      const remaining = MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
        logger.warn(
          { group: group.name, size: stderr.length },
          'Agent stderr truncated due to size limit',
        );
      } else {
        stderr += chunk;
      }
    });

    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      logger.error({ group: group.name, processId }, 'Agent process timeout, killing');
      agentProcess.kill('SIGTERM');
      setTimeout(() => {
        if (!agentProcess.killed) {
          agentProcess.kill('SIGKILL');
        }
      }, 5000);
    }, group.containerConfig?.timeout || CONTAINER_TIMEOUT);

    agentProcess.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      if (timedOut) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const timeoutLog = path.join(logsDir, `agent-${ts}.log`);
        fs.writeFileSync(timeoutLog, [
          `=== Agent Process Log (TIMEOUT) ===`,
          `Timestamp: ${new Date().toISOString()}`,
          `Group: ${group.name}`,
          `Process ID: ${processId}`,
          `Duration: ${duration}ms`,
          `Exit Code: ${code}`,
        ].join('\n'));

        logger.error(
          { group: group.name, processId, duration, code },
          'Agent process timed out',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Agent timed out after ${group.containerConfig?.timeout || CONTAINER_TIMEOUT}ms`,
        });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `agent-${timestamp}.log`);
      const isVerbose =
        process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace';

      const logLines = [
        `=== Agent Process Log ===`,
        `Timestamp: ${new Date().toISOString()}`,
        `Group: ${group.name}`,
        `IsMain: ${input.isMain}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${code}`,
        `Stdout Truncated: ${stdoutTruncated}`,
        `Stderr Truncated: ${stderrTruncated}`,
        ``,
      ];

      const isError = code !== 0;

      if (isVerbose || isError) {
        logLines.push(
          `=== Input ===`,
          JSON.stringify(input, null, 2),
          ``,
          `=== Working Directory ===`,
          groupDir,
          ``,
          `=== Stderr${stderrTruncated ? ' (TRUNCATED)' : ''} ===`,
          stderr,
          ``,
          `=== Stdout${stdoutTruncated ? ' (TRUNCATED)' : ''} ===`,
          stdout,
        );
      } else {
        logLines.push(
          `=== Input Summary ===`,
          `Prompt length: ${input.prompt.length} chars`,
          `Session ID: ${input.sessionId || 'new'}`,
          ``,
        );
      }

      fs.writeFileSync(logFile, logLines.join('\n'));
      logger.debug({ logFile, verbose: isVerbose }, 'Agent log written');

      if (code !== 0) {
        logger.error(
          {
            group: group.name,
            code,
            duration,
            stderr,
            stdout,
            logFile,
          },
          'Agent process exited with error',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Agent exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      try {
        // Extract JSON between sentinel markers for robust parsing
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          // Fallback: last non-empty line (backwards compatibility)
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }

        const output: ContainerOutput = JSON.parse(jsonLine);

        logger.info(
          {
            group: group.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          'Agent process completed',
        );

        resolve(output);
      } catch (err) {
        logger.error(
          {
            group: group.name,
            stdout,
            stderr,
            error: err,
          },
          'Failed to parse agent output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse agent output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    agentProcess.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ group: group.name, processId, error: err }, 'Agent spawn error');
      resolve({
        status: 'error',
        result: null,
        error: `Agent spawn error: ${err.message}`,
      });
    });
  });
}

/**
 * Main entry point: dispatches to Docker or process mode based on config
 */
export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, processId: string) => void,
): Promise<ContainerOutput> {
  logger.info(
    { mode: AGENT_EXECUTION_MODE, group: group.name },
    'Running agent in configured mode',
  );

  if (AGENT_EXECUTION_MODE === 'docker') {
    return runDockerAgent(group, input, onProcess);
  } else {
    return runProcessAgent(group, input, onProcess);
  }
}

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  // Write filtered tasks to the group's IPC directory
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all tasks, others only see their own
  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);

  const tasksFile = path.join(groupIpcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

/**
 * Write available groups snapshot for the container to read.
 * Only main group can see all available groups (for activation).
 * Non-main groups only see their own registration status.
 */
export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  registeredJids: Set<string>,
): void {
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // Main sees all groups; others see nothing (they can't activate groups)
  const visibleGroups = isMain ? groups : [];

  const groupsFile = path.join(groupIpcDir, 'available_groups.json');
  fs.writeFileSync(
    groupsFile,
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

/**
 * Jarvis Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout
 * Uses Azure OpenAI for agent intelligence
 */

import fs from 'fs';
import path from 'path';
import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import { createIpcMcp } from './ipc-mcp.js';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
}

interface AgentResponse {
  outputType: 'message' | 'log';
  userMessage?: string;
  internalLog?: string;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: AgentResponse | null;
  newSessionId?: string;
  error?: string;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

function loadSystemPrompt(): string {
  const claudeMdPath = '/workspace/group/CLAUDE.md';
  let systemPrompt = 'You are Jarvis, a helpful AI assistant.';
  
  if (fs.existsSync(claudeMdPath)) {
    try {
      systemPrompt = fs.readFileSync(claudeMdPath, 'utf-8');
      log('Loaded CLAUDE.md system prompt');
    } catch (err) {
      log(`Failed to load CLAUDE.md: ${err}`);
    }
  }
  
  return systemPrompt;
}

async function main(): Promise<void> {
  let input: ContainerInput;

  try {
    const stdinData = await readStdin();
    input = JSON.parse(stdinData);
    log(`Received input for group: ${input.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }

  const endpoint = process.env.AZURE_ENDPOINT;
  const apiKey = process.env.AZURE_API_KEY;
  const deploymentName = process.env.AZURE_DEPLOYMENT_NAME || 'gpt-4';

  if (!endpoint || !apiKey) {
    writeOutput({
      status: 'error',
      result: null,
      error: 'Azure OpenAI configuration missing. Set AZURE_ENDPOINT and AZURE_API_KEY.'
    });
    process.exit(1);
  }

  try {
    const client = new OpenAIClient(
      endpoint,
      new AzureKeyCredential(apiKey)
    );

    const systemPrompt = loadSystemPrompt();
    const userPrompt = input.isScheduledTask 
      ? `[SCHEDULED TASK]\n\n${input.prompt}` 
      : input.prompt;

    log('Calling Azure OpenAI...');

    const completion = await client.getChatCompletions(
      deploymentName,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      {
        temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
        maxTokens: 4000
      }
    );
    
    const assistantMessage = completion.choices[0]?.message?.content || 'No response';
    
    log(`Received response (${assistantMessage.length} chars)`);

    writeOutput({
      status: 'success',
      result: {
        outputType: 'message',
        userMessage: assistantMessage
      },
      newSessionId: input.sessionId || `session-${Date.now()}`
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      error: errorMessage
    });
    process.exit(1);
  }
}

main();

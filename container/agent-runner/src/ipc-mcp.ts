/**
 * IPC-based MCP-like interface for Jarvis
 * Writes messages and tasks to files for the host process to pick up
 */

import fs from 'fs';
import path from 'path';

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

export interface IpcMcpContext {
  chatJid: string;
  groupFolder: string;
  isMain: boolean;
}

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

export function createIpcMcp(ctx: IpcMcpContext) {
  const { chatJid, groupFolder, isMain } = ctx;

  return {
    sendMessage: async (text: string): Promise<string> => {
      const data = {
        type: 'send_message',
        chatJid,
        text,
        timestamp: Date.now()
      };
      const filename = writeIpcFile(MESSAGES_DIR, data);
      return `Message queued: ${filename}`;
    },

    scheduleTask: async (args: {
      taskName: string;
      cronExpression: string;
      prompt: string;
    }): Promise<string> => {
      if (!isMain) {
        throw new Error('schedule_task can only be used in the Main group');
      }

      const data = {
        type: 'schedule_task',
        taskName: args.taskName,
        cronExpression: args.cronExpression,
        prompt: args.prompt,
        groupFolder,
        timestamp: Date.now()
      };

      const filename = writeIpcFile(TASKS_DIR, data);
      return `Task scheduled: ${args.taskName} (${args.cronExpression})`;
    },

    unscheduleTask: async (taskName: string): Promise<string> => {
      if (!isMain) {
        throw new Error('unschedule_task can only be used in the Main group');
      }

      const data = {
        type: 'unschedule_task',
        taskName,
        groupFolder,
        timestamp: Date.now()
      };

      const filename = writeIpcFile(TASKS_DIR, data);
      return `Task unscheduled: ${taskName}`;
    },

    readMemory: (key: string): string | null => {
      const memoryPath = path.join('/workspace/group/memory', `${key}.txt`);
      if (fs.existsSync(memoryPath)) {
        return fs.readFileSync(memoryPath, 'utf-8');
      }
      return null;
    },

    writeMemory: (key: string, value: string): string => {
      const memoryDir = path.join('/workspace/group/memory');
      fs.mkdirSync(memoryDir, { recursive: true });
      const memoryPath = path.join(memoryDir, `${key}.txt`);
      fs.writeFileSync(memoryPath, value, 'utf-8');
      return `Memory written: ${key}`;
    }
  };
}

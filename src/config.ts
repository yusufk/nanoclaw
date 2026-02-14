import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env BEFORE reading any process.env values
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Jarvis';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Telegram Configuration
export const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
export const BOTMASTER_ID = process.env.BOTMASTER_ID
  ? parseInt(process.env.BOTMASTER_ID, 10)
  : 0;

// Azure OpenAI Configuration
export const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT || '';
export const AZURE_API_KEY = process.env.AZURE_API_KEY || '';
export const AZURE_API_VERSION = process.env.AZURE_API_VERSION || '2024-12-01-preview';
export const AZURE_DEPLOYMENT_NAME = process.env.AZURE_DEPLOYMENT_NAME || '';

// Agent Execution Mode: 'docker' for container isolation, 'process' for simpler deployment
export const AGENT_EXECUTION_MODE = (process.env.AGENT_EXECUTION_MODE || 'process') as 'docker' | 'process';

// Optional Tool Configuration
export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
export const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID || '';

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || '/Users/user';

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_GROUP_FOLDER = 'main';

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '300000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

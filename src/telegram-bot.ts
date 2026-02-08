/**
 * Telegram Bot Manager for NanoClaw
 * Manages Telegram bot lifecycle, message handling, and group tracking
 */
import TelegramBot from 'node-telegram-bot-api';
import { ASSISTANT_NAME, TELEGRAM_TOKEN, TELEGRAM_WHITELIST } from './config.js';
import { logger } from './logger.js';

let bot: TelegramBot | null = null;

export interface TelegramMessage {
  chatId: string; // Telegram chat ID as string (for compatibility with JID field)
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
  chatName: string;
  senderId: number;
  senderName: string;
  text: string;
  messageId: number;
  timestamp: Date;
  isFromMe: boolean;
}

export interface TelegramMessageListener {
  (message: TelegramMessage): void | Promise<void>;
}

let messageListener: TelegramMessageListener | null = null;

/**
 * Initialize Telegram bot with token from environment.
 * @returns The bot instance or null if token is missing
 */
export function initTelegramBot(): TelegramBot | null {
  if (!TELEGRAM_TOKEN) {
    logger.error('TELEGRAM_TOKEN not set in environment');
    return null;
  }

  try {
    bot = new TelegramBot(TELEGRAM_TOKEN, {
      polling: {
        interval: 2000,
        autoStart: false,
      },
    });

    logger.info('Telegram bot initialized');
    return bot;
  } catch (err) {
    logger.error({ error: err }, 'Failed to initialize Telegram bot');
    return null;
  }
}

/**
 * Check if user is whitelisted.
 */
function isWhitelisted(userId: number): boolean {
  // If no whitelist configured, allow all (open mode)
  if (TELEGRAM_WHITELIST.length === 0) {
    logger.warn('No whitelist configured, allowing all users');
    return true;
  }

  return TELEGRAM_WHITELIST.includes(userId);
}

/**
 * Start the Telegram bot and set up message handlers.
 */
export async function startTelegramBot(onMessage: TelegramMessageListener): Promise<void> {
  if (!bot) {
    throw new Error('Bot not initialized. Call initTelegramBot() first.');
  }

  messageListener = onMessage;

  // Handle text messages
  bot.on('message', async (msg) => {
    // Only process text messages
    if (!msg.text) return;

    // Check whitelist
    if (!isWhitelisted(msg.from?.id || 0)) {
      logger.warn(
        { userId: msg.from?.id, username: msg.from?.username },
        'Unauthorized user attempted to use bot',
      );
      await bot?.sendMessage(
        msg.chat.id,
        '❌ Unauthorized. This bot is private.',
      );
      return;
    }

    const chatType = msg.chat.type;
    const isGroup = chatType === 'group' || chatType === 'supergroup';
    
    // Get chat name
    let chatName: string;
    if (msg.chat.title) {
      chatName = msg.chat.title; // Group name
    } else if (msg.chat.username) {
      chatName = msg.chat.username; // User username
    } else if (msg.chat.first_name) {
      chatName = `${msg.chat.first_name}${msg.chat.last_name ? ' ' + msg.chat.last_name : ''}`;
    } else {
      chatName = `Chat ${msg.chat.id}`;
    }

    // Get sender information
    const senderId = msg.from?.id || 0;
    const senderName = msg.from?.first_name
      ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}`
      : msg.from?.username || 'Unknown';

    const telegramMessage: TelegramMessage = {
      chatId: msg.chat.id.toString(),
      chatType: chatType as 'private' | 'group' | 'supergroup' | 'channel',
      chatName,
      senderId,
      senderName,
      text: msg.text,
      messageId: msg.message_id,
      timestamp: new Date((msg.date || 0) * 1000),
      isFromMe: false, // Bot messages are handled separately
    };

    logger.debug(
      {
        chatId: telegramMessage.chatId,
        chatName: telegramMessage.chatName,
        chatType: telegramMessage.chatType,
        sender: senderName,
        text: msg.text.substring(0, 100),
      },
      'Received Telegram message',
    );

    if (messageListener) {
      try {
        await messageListener(telegramMessage);
      } catch (err) {
        logger.error(
          { error: err, chatId: msg.chat.id },
          'Error in message listener',
        );
      }
    }
  });

  // Handle bot commands
  bot.onText(/\/start/, async (msg) => {
    if (!isWhitelisted(msg.from?.id || 0)) return;

    const greeting = `👋 Hello! I'm ${ASSISTANT_NAME}.

I'm your personal AI assistant running on NanoClaw.

**Getting Started:**
- Message me with @${ASSISTANT_NAME} followed by your request
- I can help with tasks, answer questions, and more
- Use /help to see available commands

**Example:**
\`@${ASSISTANT_NAME} What's the weather like?\``;

    await bot?.sendMessage(msg.chat.id, greeting, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/help/, async (msg) => {
    if (!isWhitelisted(msg.from?.id || 0)) return;

    const help = `**${ASSISTANT_NAME} Commands:**

\`/start\` - Start the bot and see introduction
\`/help\` - Show this help message
\`/status\` - Show bot status

**Triggering the Assistant:**
Mention me with @${ASSISTANT_NAME} followed by your request.

**Examples:**
- \`@${ASSISTANT_NAME} schedule a reminder for tomorrow at 10am\`
- \`@${ASSISTANT_NAME} search for the latest news\`
- \`@${ASSISTANT_NAME} what's the current time?\``;

    await bot?.sendMessage(msg.chat.id, help, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/status/, async (msg) => {
    if (!isWhitelisted(msg.from?.id || 0)) return;

    const status = `✅ **${ASSISTANT_NAME} Status**

Bot is running and ready to assist.

**Configuration:**
- Polling: Active
- Whitelist: ${TELEGRAM_WHITELIST.length > 0 ? `${TELEGRAM_WHITELIST.length} users` : 'Open (no whitelist)'}
- Chat Type: ${msg.chat.type}`;

    await bot?.sendMessage(msg.chat.id, status, { parse_mode: 'Markdown' });
  });

  // Error handling
  bot.on('polling_error', (error) => {
    logger.error({ error }, 'Telegram polling error');
  });

  bot.on('error', (error) => {
    logger.error({ error }, 'Telegram bot error');
  });

  // Start polling
  await bot.startPolling();
  logger.info('Telegram bot started polling');
}

/**
 * Stop the Telegram bot.
 */
export async function stopTelegramBot(): Promise<void> {
  if (bot) {
    await bot.stopPolling();
    logger.info('Telegram bot stopped');
  }
}

/**
 * Send a message to a Telegram chat.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<void> {
  if (!bot) {
    throw new Error('Bot not initialized');
  }

  try {
    await bot.sendMessage(parseInt(chatId, 10), text, {
      parse_mode: 'Markdown',
    });
    logger.debug({ chatId }, 'Sent message to Telegram chat');
  } catch (err) {
    logger.error({ error: err, chatId }, 'Failed to send Telegram message');
    throw err;
  }
}

/**
 * Get the bot instance.
 */
export function getTelegramBot(): TelegramBot | null {
  return bot;
}

/**
 * Check if bot is initialized and ready.
 */
export function isBotReady(): boolean {
  return bot !== null;
}

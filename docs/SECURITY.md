# NanoClaw Security Model

## Trust Model

| Entity | Trust Level | Rationale |
|--------|-------------|-----------|
| Botmaster | Trusted | Single authorized Telegram user ID |
| Other Telegram users | Blocked | Bot only responds to botmaster |
| Agent processes | Controlled | Isolated child processes with environment control |
| Telegram messages | User input | Potential prompt injection from botmaster |

## Security Boundaries

### 1. Botmaster Authorization (Primary Boundary)

The bot uses **single-user authorization** via `BOTMASTER_ID`:
- Only the configured Telegram user ID can interact with the bot
- All messages from other users are silently ignored
- No whitelist management - one trusted user only
- Authorization checked in [src/telegram-bot.ts](../src/telegram-bot.ts) via `isBotmaster()` function

This is the primary security boundary. The system is designed for personal use by a single trusted individual.

### 2. Process Isolation

Agents execute in separate Node.js child processes spawned via [src/container-runner.ts](../src/container-runner.ts):
- **Process separation** - Agent runs in isolated child process
- **Controlled environment** - Only specified env vars passed to agent
- **Working directory isolation** - Each group has separate working directory
- **No shared memory** - Separate process memory space
- **Single-use execution** - Fresh process per agent invocation

### 3. Session Isolation

Each group has isolated session data at `data/sessions/{group}/.claude/`:
- Groups cannot see other groups' conversation history
- Session IDs are group-specific
- Prevents cross-group information disclosure
- Main group has separate session from other groups

### 4. IPC Authorization

Messages and task operations are verified against group identity:

| Operation | Main Group | Non-Main Group |
|-----------|------------|----------------|
| Send message to own chat | ✓ | ✓ |
| Send message to other chats | ✓ | ✗ |
| Schedule task for self | ✓ | ✓ |
| Schedule task for others | ✓ | ✗ |
| View all tasks | ✓ | Own only |
| Manage other groups | ✓ | ✗ |

### 5. Credential Handling

**Environment Variables Passed to Agent:**
- Azure OpenAI credentials (`AZURE_ENDPOINT`, `AZURE_API_KEY`, `AZURE_DEPLOYMENT_NAME`)
- Optional API keys (`GOOGLE_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID`)
- Temperature and other model parameters

**NOT Exposed to Agent:**
- Telegram bot token (`TELEGRAM_TOKEN`) - routing layer only
- Botmaster ID (`BOTMASTER_ID`) - routing layer only
- Database files - host process only
- Other users' session data

**Credential Filtering in [container/agent-runner/src/index.ts](../container/agent-runner/src/index.ts):**
```typescript
const allowedVars = [
  'AZURE_ENDPOINT',
  'AZURE_API_KEY',
  'AZURE_API_VERSION',
  'AZURE_DEPLOYMENT_NAME',
  'TEMPERATURE',
  'GOOGLE_API_KEY',
  'GOOGLE_SEARCH_ENGINE_ID',
];
```

## Privilege Comparison

| Capability | Main Group | Non-Main Group |
|------------|------------|----------------|
| Working directory | `groups/main/` | `groups/{name}/` |
| Session access | Own session only | Own session only |
| IPC directory | `data/ipc/main/` | `data/ipc/{name}/` |
| Network access | Unrestricted | Unrestricted |
| Azure OpenAI access | Yes | Yes |

## Security Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        UNTRUSTED ZONE                             │
│  Telegram Messages (from botmaster - potential prompt injection)  │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼ Botmaster ID check
┌──────────────────────────────────────────────────────────────────┐
│                     HOST PROCESS (TRUSTED)                        │
│  • Telegram bot connection (src/telegram-bot.ts)                  │
│  • Message routing (src/index.ts)                                 │
│  • IPC authorization                                              │
│  • Database operations (src/db.ts)                                │
│  • Credential filtering                                           │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼ spawn() with controlled env
┌──────────────────────────────────────────────────────────────────┐
│                 AGENT PROCESS (ISOLATED)                          │
│  • Azure OpenAI calls (container/agent-runner/src/index.ts)       │
│  • Group-specific working directory                               │
│  • Filtered environment variables                                 │
│  • Separate memory space                                          │
│  • Cannot access Telegram bot token                               │
│  • Cannot modify security config                                  │
└──────────────────────────────────────────────────────────────────┘
```

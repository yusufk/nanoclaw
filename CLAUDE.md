# NanoClaw

Personal AI assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process that connects to Telegram, routes messages to Azure OpenAI (o4-mini reasoning model) running in isolated child processes. Each group has isolated memory and execution environment.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main app: Telegram connection, message routing, IPC |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent child processes (Node.js) |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `src/telegram-bot.ts` | Telegram bot lifecycle and authorization |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev                                      # Run with hot reload
npm run build                                    # Compile TypeScript
cd container/agent-runner && npm run build       # Rebuild agent runner
```

Service management:
```bash
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
```

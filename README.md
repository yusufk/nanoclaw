<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  My personal AI assistant that runs securely with process isolation. Lightweight and built to be understood and customized for your own needs.
</p>

## Why I Built This

[OpenClaw](https://github.com/openclaw/openclaw) is an impressive project with a great vision. But I can't sleep well running software I don't understand with access to my life. OpenClaw has 52+ modules, 8 config management files, 45+ dependencies, and abstractions for 15 channel providers. Security is application-level (allowlists, pairing codes) rather than OS isolation. Everything runs in one Node process with shared memory.

NanoClaw gives you the same core functionality in a codebase you can understand in 8 minutes. One process. A handful of files. Agents run in isolated child processes with controlled filesystem access, not behind permission checks.

## Quick Start

```bash
git clone https://github.com/gavrielc/nanoclaw.git
cd nanoclaw
npm install
cd container/agent-runner && npm install && cd ../..
cp .env.example .env
# Edit .env with your credentials
npm run build
npm start
```

**Setup Requirements:**
1. Create a Telegram bot via [@BotFather](https://t.me/botfather) and get your `TELEGRAM_TOKEN`
2. Get your Telegram user ID as `BOTMASTER_ID` (message [@userinfobot](https://t.me/userinfobot))
3. Configure Azure OpenAI credentials (`AZURE_ENDPOINT`, `AZURE_API_KEY`, `AZURE_DEPLOYMENT_NAME`)
4. Set `ASSISTANT_NAME` to your preferred trigger word (default: Jarvis)

## Philosophy

**Small enough to understand.** One process, a few source files. No microservices, no message queues, no abstraction layers. Have Claude Code walk you through it.

**Secure by isolation.** Agents run in child processes with separate execution contexts. They can only see what's explicitly made available. The system is designed for personal use with process-level isolation.

**Built for one user.** This isn't a framework. It's working software that fits my exact needs. You fork it and customize it to match your exact needs.

**Customization = code changes.** No configuration sprawl. Want different behavior? Modify the code. The codebase is small enough that this is safe.

**AI-native.** No installation wizard; use AI assistance for setup. No monitoring dashboard; ask your AI what's happening. No debugging tools; describe the problem, get it fixed.

**Skills over features.** Contributors shouldn't add features (e.g. support for WhatsApp) to the codebase. Instead, they contribute skills that transform your fork. You end up with clean code that does exactly what you need.

**Flexible AI backend.** Currently runs on Azure OpenAI (o4-mini reasoning model), but designed to be adaptable to different AI providers and models.

## What It Supports

- **Telegram I/O** - Message your assistant from your phone via Telegram
- **Isolated group context** - Each group has its own `CLAUDE.md` memory with isolated execution
- **Main channel** - Your private chat for admin control; every other group is isolated
- **Botmaster authorization** - Single user ID controls access
- **Scheduled tasks** - Recurring jobs that run the agent and can message you back
- **Web access** - Search and fetch content (via integrations)
- **Process isolation** - Agents run in separate Node.js processes with controlled access
- **Optional integrations** - Add capabilities via skills

## Usage

Talk to your assistant with the trigger word (default: `@Jarvis`):

```
@Jarvis send an overview of the sales pipeline every weekday morning at 9am (has access to my Obsidian vault folder)
@Jarvis review the git history for the past week each Friday and update the README if there's drift
@Jarvis every Monday at 8am, compile news on AI developments from Hacker News and TechCrunch and message me a briefing
```

From the main channel (your private chat), you can manage groups and tasks:
```
@Jarvis list all scheduled tasks across groups
@Jarvis pause the Monday briefing task
@Jarvis join the Family Chat group
```

## Customizing

There are no configuration files to learn. The codebase is small enough to modify directly:

- Change the trigger word in [src/config.ts](src/config.ts)
- Modify the system prompt in `groups/{name}/CLAUDE.md`
- Adjust authorization logic in [src/telegram-bot.ts](src/telegram-bot.ts)
- Add custom behaviors in [src/index.ts](src/index.ts)

Or use the `/customize` skill for guided changes.

The codebase is small enough that direct modification is safe and encouraged.

## Contributing

**Don't add features. Add skills.**

If you want to add WhatsApp support, don't create a PR that adds WhatsApp alongside Telegram. Instead, contribute a skill file (`.claude/skills/add-whatsapp/SKILL.md`) that teaches AI assistants how to transform a NanoClaw installation to use WhatsApp.

Users then run the skill on their fork and get clean code that does exactly what they need, not a bloated system trying to support every use case.

### RFS (Request for Skills)

Skills we'd love to see:

**Communication Channels**
- `/add-whatsapp` - Add WhatsApp as channel. Should give the user option to replace Telegram or add as additional channel
- `/add-slack` - Add Slack
- `/add-discord` - Add Discord

**Platform Support**
- `/setup-windows` - Windows via WSL2 support

**AI Backends**
- `/add-claude` - Migrate from Azure OpenAI to Anthropic Claude
- `/add-openai` - Migrate to standard OpenAI API

## Requirements

- macOS or Linux
- Node.js 20+
- Telegram bot token (from [@BotFather](https://t.me/botfather))
- Azure OpenAI API access (or adapt to another AI provider)

## Architecture

```
Telegram Bot API → SQLite → Polling loop → Agent Process (Azure OpenAI o4-mini) → Response
```

Single Node.js process for routing. Agent executes in isolated child processes with controlled environment. IPC via filesystem. No daemons, no queues, no complexity.

Key files:
- `src/index.ts` - Main app: Telegram connection, routing, IPC
- `src/telegram-bot.ts` - Telegram bot lifecycle and authorization
- `src/container-runner.ts` - Spawns agent child processes
- `src/task-scheduler.ts` - Runs scheduled tasks
- `src/db.ts` - SQLite operations
- `container/agent-runner/src/index.ts` - Azure OpenAI agent logic
- `groups/*/CLAUDE.md` - Per-group memory

## FAQ

**Why Telegram and not WhatsApp/Signal/etc?**

Because the current implementation uses Telegram. The codebase is small enough to adapt to other platforms via skills. That's the whole point - fork and customize.

**Can I run this on Linux?**

Yes. The architecture is platform-agnostic. Process-based execution works on both macOS and Linux.

**Is this secure?**

Agents run in separate Node.js processes with controlled environment access, not behind application-level permission checks. The botmaster authorization model ensures only you can interact with the bot. You should still review what you're running, but the codebase is small enough that you actually can. See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

**Why no configuration files?**

We don't want configuration sprawl. Every user should customize it to so that the code matches exactly what they want rather than configuring a generic system. If you like having config files, tell Claude to add them.

**How do I debug issues?**

Check the logs in `groups/{name}/logs/` for agent execution details. The codebase is small enough to trace through. Set `LOG_LEVEL=debug` in [.env](.env) for verbose output.

**Why isn't the setup working for me?**

Run `/debug` skill if available, or check the logs manually. For new installations, verify:
- Telegram bot token is valid
- BOTMASTER_ID matches your Telegram user ID  
- Azure OpenAI credentials are configured
- Agent runner dependencies are installed (`cd container/agent-runner && npm install`)

**What changes will be accepted into the codebase?**

Security fixes, bug fixes, and clear improvements to the base configuration. That's it.

Everything else (new capabilities, OS compatibility, hardware support, enhancements) should be contributed as skills.

This keeps the base system minimal and lets every user customize their installation without inheriting features they don't want.

## License

MIT

<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  My personal AI assistant with configurable security isolation. Choose between Docker containers for OS-level sandboxing or simple processes for lightweight deployment.
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

**Secure by isolation.** Choose your security model: Docker containers for OS-level isolation with filesystem sandboxing, or child processes for simpler deployment. Agents only see what you explicitly expose.

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
- **Dual execution modes**:
  - **Docker mode** - Full OS-level isolation, filesystem sandboxing, runs as unprivileged user
  - **Process mode** - Lightweight child processes, simpler deployment, faster startup
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
- **Docker/Rancher Desktop** (optional, only if using `AGENT_EXECUTION_MODE=docker`)

## Execution Modes

NanoClaw supports two execution modes for running agents:

### Docker Mode (Recommended for Security)

Agents run in isolated Docker containers:
- ✅ **OS-level isolation** - Separate namespaces, cgroups, filesystem
- ✅ **Filesystem sandboxing** - Only mounted directories are accessible
- ✅ **Unprivileged user** - Container runs as non-root user
- ✅ **Resource limits** - Memory and CPU constraints
- ✅ **Network isolation** - No network access by default
- ⚠️ Requires Docker or Rancher Desktop installed
- ⚠️ Slightly slower startup (container spawn overhead)

**Setup:**
```bash
# Build the container image
cd container
./build.sh
cd ..

# Set in .env:
AGENT_EXECUTION_MODE=docker
CONTAINER_IMAGE=nanoclaw-agent:latest
```

### Process Mode (Simpler Deployment)

Agents run as Node.js child processes:
- ✅ **Fast startup** - No container overhead
- ✅ **Simple deployment** - No Docker required
- ✅ **Easy debugging** - Direct process inspection
- ⚠️ **No OS-level isolation** - Agent runs with your user permissions
- ⚠️ **Full filesystem access** - Agent can read any file you can
- ⚠️ **Shared system resources** - No hard resource limits

**Setup:**
```bash
# Just build the agent runner
cd container/agent-runner
npm install
npm run build
cd ../..

# Set in .env:
AGENT_EXECUTION_MODE=process
```

**Which mode should I use?**
- Use **Docker mode** if you want maximum security isolation
- Use **process mode** for simpler setup or if Docker isn't available
- You can switch modes anytime by changing `AGENT_EXECUTION_MODE` in `.env`

## Architecture

```
Telegram Bot API → SQLite → Polling loop → Agent (Azure OpenAI o4-mini) → Response
                                          ↓
                                    Docker Container (secure)
                                        OR
                                    Child Process (simple)
```

Single Node.js process for routing. Agent executes in Docker containers (secure isolation) or child processes (simple deployment). IPC via filesystem. No daemons, no queues, no complexity.

Key files:
- `src/index.ts` - Main app: Telegram connection, routing, IPC
- `src/telegram-bot.ts` - Telegram bot lifecycle and authorization
- `src/container-runner.ts` - Spawns agents in Docker or process mode
- `src/task-scheduler.ts` - Runs scheduled tasks
- `src/db.ts` - SQLite operations
- `container/agent-runner/src/index.ts` - Azure OpenAI agent logic
- `container/Dockerfile` - Docker container definition (for Docker mode)
- `groups/*/CLAUDE.md` - Per-group memory

## FAQ

**Why Telegram and not WhatsApp/Signal/etc?**

Because the current implementation uses Telegram. The codebase is small enough to adapt to other platforms via skills. That's the whole point - fork and customize.

**Can I run this on Linux?**

Yes. The architecture is platform-agnostic. Both Docker and process modes work on macOS and Linux.

**Is this secure?**

It depends on your execution mode:

- **Docker mode**: Agents run in isolated containers with filesystem sandboxing, resource limits, and no network access. Only explicitly mounted directories are accessible.
- **Process mode**: Agents run as child processes with your user's permissions. They have full filesystem access and no OS-level isolation.

The botmaster authorization model ensures only you can interact with the bot. You should still review what you're running, but the codebase is small enough that you actually can. See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

**Why no configuration files?**

We don't want configuration sprawl. Every user should customize it to so that the code matches exactly what they want rather than configuring a generic system. If you like having config files, tell Claude to add them.

**How do I debug issues?**

Check the logs in `groups/{name}/logs/` for agent execution details. Use `/debug` command in Telegram to see system diagnostics. The codebase is small enough to trace through. Set `LOG_LEVEL=debug` in [.env](.env) for verbose output.

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

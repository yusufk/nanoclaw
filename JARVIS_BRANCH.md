# Jarvis Branch - Telegram + Azure OpenAI

This branch implements Telegram integration and Azure OpenAI as a replacement for WhatsApp and Claude in NanoClaw.

## Key Changes

### 1. Platform Migration
- **WhatsApp → Telegram**: Replaced `@whiskeysockets/baileys` with `node-telegram-bot-api`
- **Apple Container → Docker**: Updated container runtime for cross-platform support
- **Claude SDK → Azure OpenAI**: Replaced `@anthropic-ai/claude-agent-sdk` with `@azure/openai`

### 2. Configuration System
- Added `.env.example` with comprehensive configuration template
- Environment variables now loaded via `dotenv` package
- Configuration in [src/config.ts](src/config.ts) updated with Telegram and Azure OpenAI settings

### 3. Core Files Modified

#### New Files
- `src/telegram-bot.ts`: Telegram bot manager with message handling and whitelist
- `.env.example`: Environment configuration template
- `container/agent-runner/src/index.ts.claude-backup`: Backup of original Claude-based runner

#### Modified Files
- `src/index.ts`: Telegram integration, removed WhatsApp dependencies
- `src/config.ts`: Added Telegram/Azure OpenAI config, changed default name to "Jarvis"
- `src/container-runner.ts`: Docker conversion, Azure credentials filtering
- `container/agent-runner/src/index.ts`: Complete rewrite for Azure OpenAI
- `container/agent-runner/package.json`: Updated dependencies
- `package.json`: Removed WhatsApp, added Telegram and dotenv
- `groups/main/CLAUDE.md`: Updated assistant name to Jarvis
- `groups/global/CLAUDE.md`: Updated assistant name to Jarvis
- `README.md`: Updated examples with @Jarvis trigger

### 4. Architecture Preserved
- ✅ Multi-group isolation
- ✅ Container-based agent execution  
- ✅ Task scheduling (cron/interval/once)
- ✅ IPC-based MCP tool system
- ✅ File-based memory (CLAUDE.md files)
- ✅ Session management and archiving

## Setup Instructions

### Prerequisites
1. **Docker**: Install from https://docker.com/products/docker-desktop
2. **Node.js 20+**: Required for running the host process
3. **Telegram Bot**: Create a bot via @BotFather on Telegram
4. **Azure OpenAI**: Active Azure OpenAI deployment

### Installation

1. **Clone and switch to this branch**:
   ```bash
   git checkout jarvis-telegram-azure
   ```

2. **Install dependencies**:
   ```bash
   npm install
   cd container/agent-runner && npm install && cd ../..
   ```

3. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. **Configure `.env`**:
   ```env
   ASSISTANT_NAME=Jarvis
   TELEGRAM_TOKEN=<your-bot-token-from-botfather>
   WHITE_LIST=<your-telegram-user-id>  # Get from @userinfobot
   
   AZURE_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_API_KEY=<your-azure-openai-key>
   AZURE_API_VERSION=2024-02-15-preview
   AZURE_DEPLOYMENT_NAME=<your-deployment-name>
   ```

5. **Build container image**:
   ```bash
   cd container
   docker build -t nanoclaw-agent:latest .
   cd ..
   ```

6. **Build and start bot**:
   ```bash
   npm run build
   npm start
   ```

### First Use

1. **Find your bot** on Telegram using the username from @BotFather
2. **Send `/start`** to initialize the bot
3. **Trigger the assistant**: `@Jarvis hello!`
4. **Register groups** (from main chat): `@Jarvis register group <group-name>`

## Database Compatibility

The database schema is compatible between WhatsApp and Telegram versions:
- `jid` field stores Telegram `chat_id` as string (instead of WhatsApp JID)
- All existing tables and indexes work unchanged
- Migration from WhatsApp data not automated (start fresh recommended)

## Environment Variables

### Required
- `TELEGRAM_TOKEN`: Bot token from @BotFather
- `AZURE_ENDPOINT`: Azure OpenAI endpoint URL
- `AZURE_API_KEY`: Azure OpenAI API key
- `AZURE_DEPLOYMENT_NAME`: Name of your deployed model

### Optional
- `ASSISTANT_NAME`: Bot trigger name (default: "Jarvis")
- `WHITE_LIST`: Comma-separated Telegram user IDs (empty = open access)
- `AZURE_API_VERSION`: API version (default: 2024-02-15-preview)
- `TEMPERATURE`: Model temperature (default: 0.7)
- `GOOGLE_API_KEY`: For web search capability
- `GOOGLE_SEARCH_ENGINE_ID`: For web search capability
- `CONTAINER_IMAGE`: Docker image name (default: nanoclaw-agent:latest)
- `CONTAINER_TIMEOUT`: Timeout in ms (default: 300000 = 5 min)
- `MAX_CONCURRENT_CONTAINERS`: Max parallel agents (default: 5)

## Deployment to Azure/Rancher

### Docker Deployment

1. **Build and tag image**:
   ```bash
   docker build -t your-registry/jarvis:latest container/
   docker push your-registry/jarvis:latest
   ```

2. **Run with Docker**:
   ```bash
   docker run -d \
     --name jarvis \
     --restart unless-stopped \
     -v /var/run/docker.sock:/var/run/docker.sock \
     -v $(pwd)/groups:/app/groups \
     -v $(pwd)/data:/app/data \
     -v $(pwd)/store:/app/store \
     --env-file .env \
     your-registry/jarvis:latest
   ```

### Kubernetes/Rancher

See `docs/KUBERNETES.md` (to be created) for full deployment manifests.

Key requirements:
- Docker-in-Docker or host Docker socket mount
- Persistent volumes for `groups/`, `data/`, `store/`
- ConfigMap or Secret for environment variables
- Service account with container create/delete permissions

## Testing

1. **Telegram Bot Connection**:
   ```bash
   # Check logs for "Connected to Telegram"
   npm start
   ```

2. **Azure OpenAI Integration**:
   - Send `@Jarvis test` in Telegram
   - Check logs for "Calling Azure OpenAI..."
   - Verify response received

3. **Container Execution**:
   ```bash
   # Should see container spawn and complete
   docker ps  # While agent is running
   ```

4. **Multi-Group**:
   - Add bot to multiple Telegram groups
   - Register each group from main chat
   - Verify separate `groups/<folder>` directories created

## Differences from Main Branch

| Feature | Main (WhatsApp/Claude) | This Branch (Telegram/Azure OpenAI) |
|---------|------------------------|-------------------------------------|
| Platform | WhatsApp | Telegram |
| AI Model | Claude (Anthropic) | Azure OpenAI |
| Container | Apple Container | Docker |
| Auth | QR Code scan | Bot token |
| Group Discovery | Automatic fetch | Dynamic on message |
| API SDK | Claude Agent SDK | Azure OpenAI SDK |
| Session Storage | Claude .claude/ format | Custom JSON format |
| Tools | Built-in SDK tools | IPC-MCP (future integration) |

## Known Limitations

1. **Tool Integration**: MCP tools (search, schedule, etc.) need Azure OpenAI function calling implementation (TODO)
2. **Group Discovery**: Telegram groups discovered only when bot receives messages (vs WhatsApp's active fetch)
3. **Voice Messages**: Not yet implemented (WhatsApp Baileys supported this)
4. **Media Handling**: Text only currently (images, documents TODO)

## Troubleshooting

### "Docker is not running"
- Start Docker Desktop
- Verify: `docker info`

### "Unauthorized user"
- Add your Telegram user ID to `WHITE_LIST` in `.env`
- Get ID from @userinfobot on Telegram

### "Azure OpenAI configuration missing"
- Verify `AZURE_ENDPOINT`, `AZURE_API_KEY`, `AZURE_DEPLOYMENT_NAME` in `.env`
- Check endpoint doesn't have trailing slash
- Verify API key is valid

### "Container timed out"
- Increase `CONTAINER_TIMEOUT` in `.env`
- Check container logs: `docker logs <container-name>`
- Verify Azure OpenAI endpoint is reachable

### Bot not responding
- Check `WHITE_LIST` includes your user ID
- Verify trigger uses correct format: `@Jarvis` (case-insensitive)
- Check logs for errors: `npm start`

## Future Enhancements

- [ ] Add jarvis-azure tools (Google Search, stock analysis)
- [ ] Implement Azure OpenAI function calling for MCP tools
- [ ] Add webhook support for production (currently polling)
- [ ] Support voice messages with OpenAI Whisper integration
- [ ] Add image/document handling
- [ ] Create Kubernetes deployment manifests
- [ ] Add monitoring/telemetry
- [ ] Implement conversation summarization
- [ ] Add unit tests

## Contributing

This is a feature branch. To contribute:
1. Create a feature branch from `jarvis-telegram-azure`
2. Make changes
3. Test locally  
4. Submit PR back to `jarvis-telegram-azure`

## License

Same as main NanoClaw project.

# NanoClaw Agent Container
# Provides secure OS-level isolation for Azure OpenAI agent execution

FROM node:22-alpine

# Security: Run as non-root user
RUN addgroup -g 1001 -S nanoclaw && \
    adduser -u 1001 -S nanoclaw -G nanoclaw

WORKDIR /app

# Copy agent runner package files
COPY agent-runner/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built agent runner code
COPY agent-runner/dist ./dist

# Set ownership
RUN chown -R nanoclaw:nanoclaw /app

# Create mount point directories
RUN mkdir -p /workspace /ipc /sessions && \
    chown -R nanoclaw:nanoclaw /workspace /ipc /sessions

USER nanoclaw

# Agent reads input from stdin, outputs to stdout
ENTRYPOINT ["node", "dist/index.js"]


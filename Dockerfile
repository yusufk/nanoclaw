FROM node:22-slim

# Install Docker CLI to spawn agent containers
RUN apt-get update && apt-get install -y \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/
COPY groups/ ./groups/

# Build TypeScript
RUN npm run build

# Create data directories
RUN mkdir -p /app/store /app/data

# Add node user to docker group (will use host's docker GID via compose)
# Create docker group with placeholder GID (will be overridden by compose)
RUN groupadd -g 999 docker || true && usermod -aG docker node

# Set ownership
RUN chown -R node:node /app

USER node

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]

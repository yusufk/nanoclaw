#!/bin/bash
# Build the NanoClaw agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-agent"
TAG="${1:-latest}"

echo "Building NanoClaw agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""

# Check for Docker or compatible runtime
if command -v docker &> /dev/null; then
    RUNTIME="docker"
elif command -v nerdctl &> /dev/null; then
    RUNTIME="nerdctl"
else
    echo "Error: No container runtime found. Please install Docker or Rancher Desktop."
    exit 1
fi

echo "Using runtime: $RUNTIME"
echo ""

# First, build the agent runner TypeScript code
echo "Building agent runner..."
cd agent-runner
npm install
npm run build
cd ..

# Build container image
echo "Building container image..."
$RUNTIME build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "✅ Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "To use this image, set in your .env file:"
echo "  AGENT_EXECUTION_MODE=docker"
echo "  CONTAINER_IMAGE=${IMAGE_NAME}:${TAG}"
echo ""
echo "Test the container with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"main\",\"chatJid\":\"test\",\"isMain\":true}' | $RUNTIME run -i --rm ${IMAGE_NAME}:${TAG}"


#!/bin/bash
set -euo pipefail

echo "Pulling latest changes..."
git pull

echo "Installing dependencies..."
bun install

echo "Building server..."
bun run --filter server build

echo "Restarting PM2 process..."
if pm2 describe beatsync-server > /dev/null 2>&1; then
  pm2 restart beatsync-server
else
  pm2 start pm2.config.js
fi

echo "Waiting for process to stabilize..."
sleep 2

pm2 show beatsync-server | grep -E "status|uptime|restarts"

echo "Health check..."
if curl -sf --max-time 5 http://localhost:8080/ > /dev/null; then
  echo "Server is responding."
else
  echo "Server is not responding!"
  pm2 logs beatsync-server --lines 20 --nostream
  exit 1
fi

echo "Done."

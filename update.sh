#!/usr/bin/env bash
#
# update.sh - Pull, build, and restart the beatsync server
#
set -euo pipefail

ok()   { gum style --foreground 10 "✓ $1"; }
warn() { gum style --foreground 11 "→ $1"; }
fail() { gum style --foreground 9 "✗ $1"; }

warn "Pulling latest changes"
git pull
ok "Up to date"

warn "Installing dependencies"
bun install
ok "Dependencies installed"

warn "Building server"
bun run --filter server build
ok "Server built"

warn "Restarting PM2"
if pm2 describe beatsync-server > /dev/null 2>&1; then
  pm2 restart beatsync-server
else
  pm2 start pm2.config.js
fi
ok "PM2 restarted"

sleep 2

warn "Health check"
if curl -sf --max-time 5 http://localhost:8080/ > /dev/null; then
  ok "Server is responding"
else
  fail "Server is not responding"
  pm2 logs beatsync-server --lines 20 --nostream
  exit 1
fi

pm2 show beatsync-server | grep -E "status|uptime|restarts"
ok "Deploy complete"

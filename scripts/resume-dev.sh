#!/usr/bin/env bash
set -euo pipefail

# Resume the CRM project in a fresh Nxcode/workspace session.
# This script intentionally does NOT deploy to Cloudflare.
# It only syncs code, installs dependencies when needed, starts local dev servers,
# and registers the frontend preview.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "📁 Project: $ROOT_DIR"

if [ ! -d .git ]; then
  echo "❌ This folder is not a git checkout. Clone first with:"
  echo "   git clone https://github.com/djkwinten/CRM.git ."
  exit 1
fi

CURRENT_REMOTE="$(git remote get-url origin 2>/dev/null || true)"
if [ -z "$CURRENT_REMOTE" ]; then
  git remote add origin https://github.com/djkwinten/CRM.git
fi

# Pull latest GitHub code only when there are no local uncommitted project changes.
if git diff --quiet && git diff --cached --quiet; then
  echo "🔄 Fetching latest GitHub code..."
  git fetch origin main
  git pull --ff-only origin main || true
else
  echo "⚠️  Local changes detected; skipping automatic pull to avoid overwriting work."
fi

install_if_needed() {
  local dir="$1"
  if [ ! -d "$dir/node_modules" ]; then
    echo "📦 Installing dependencies in $dir..."
    npm --prefix "$dir" install
  else
    echo "✓ Dependencies already installed in $dir"
  fi
}

install_if_needed backend
install_if_needed frontend

stop_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "🛑 Stopping process(es) on port $port: $pids"
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

stop_port 3001
stop_port 5173

echo "🚀 Starting backend on port 3001..."
nohup npm --prefix backend run dev > /tmp/crm-backend.log 2>&1 &

echo "🚀 Starting frontend on port 5173..."
nohup npm --prefix frontend run dev -- --host 0.0.0.0 > /tmp/crm-frontend.log 2>&1 &

sleep 4

echo "\n--- Backend log ---"
tail -30 /tmp/crm-backend.log || true

echo "\n--- Frontend log ---"
tail -30 /tmp/crm-frontend.log || true

if command -v nxcode >/dev/null 2>&1; then
  echo "\n🔗 Registering Nxcode preview..."
  nxcode report-preview --port 5173 --framework vite || true
else
  echo "\nℹ️ nxcode CLI not found; open http://localhost:5173 manually."
fi

echo "\n✅ Dev environment ready."
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:3001"
echo "Logs:     /tmp/crm-frontend.log and /tmp/crm-backend.log"

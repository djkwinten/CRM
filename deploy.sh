#!/bin/bash
set -euo pipefail

# Deploy via Nxcode CLI. Do not store Cloudflare tokens in this file.
# Backend is deployed first so the frontend can be built with the deployed API URL.

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_URL="${VITE_API_URL:-}"

if [ -z "$BACKEND_URL" ]; then
  echo "🚀 Backend deployen..."
  backend_output=$(cd "$ROOT_DIR/.." && nxcode deploy --type hono --dir dj-booking-app/backend)
  echo "$backend_output"
  BACKEND_URL=$(printf '%s' "$backend_output" | node -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{try{console.log(JSON.parse(s).url||'')}catch{}})")
fi

if [ -z "$BACKEND_URL" ]; then
  echo "Kon backend URL niet bepalen. Zet VITE_API_URL handmatig en probeer opnieuw." >&2
  exit 1
fi

echo "🏗️ Frontend bouwen met API: $BACKEND_URL"
cd "$ROOT_DIR/frontend"
VITE_API_URL="$BACKEND_URL" npm run build

echo "🚀 Frontend deployen..."
cd "$ROOT_DIR/.."
nxcode deploy --type static --dir dj-booking-app/frontend/dist

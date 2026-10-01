#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_DIR="$(dirname "$ROOT_DIR")"
PROJECT_DIR="$(basename "$ROOT_DIR")"

cd "$ROOT_DIR"
npm run check
npm run build

# One Worker serves the CRM, customer portal, API and scheduled jobs.
cd "$WORKSPACE_DIR"
nxcode deploy --type hono --dir "$PROJECT_DIR"

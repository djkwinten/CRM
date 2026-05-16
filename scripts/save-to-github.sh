#!/usr/bin/env bash
set -euo pipefail

# Save project code changes to GitHub on demand.
# This script intentionally does NOT deploy to Cloudflare.
# Usage:
#   ./scripts/save-to-github.sh "Describe my change"
#
# Optional for private repos / non-interactive environments:
#   GITHUB_TOKEN=ghp_xxx ./scripts/save-to-github.sh "Describe my change"
# Never commit tokens into the repository.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MESSAGE="${1:-Save CRM project changes}"
REMOTE_URL="https://github.com/djkwinten/CRM.git"

if [ ! -d .git ]; then
  echo "❌ Not a git repository."
  exit 1
fi

# Keep platform/session files out of Git even if they exist in the workspace.
git reset -- .claude-data .nxcode .dev_server_info .dev_server_port 2>/dev/null || true

# Stage normal project changes.
git add -A \
  .env.example \
  .gitignore \
  CLOUDFLARE_DEPLOY.md \
  deploy.sh \
  package.json \
  package-lock.json \
  wrangler.toml \
  wrangler.jsonc \
  backend \
  frontend \
  scripts \
  shared 2>/dev/null || true

if git diff --cached --quiet; then
  echo "✓ No project changes to save."
  exit 0
fi

echo "📝 Creating commit: $MESSAGE"
git commit -m "$MESSAGE"

echo "⬆️ Pushing to GitHub..."
if [ -n "${GITHUB_TOKEN:-}" ]; then
  git push "https://x-access-token:${GITHUB_TOKEN}@github.com/djkwinten/CRM.git" main
else
  git push origin main || {
    echo "\n❌ Push failed. If GitHub asks for authentication, run with:"
    echo "   GITHUB_TOKEN=your_token ./scripts/save-to-github.sh \"$MESSAGE\""
    exit 1
  }
fi

echo "✅ Saved to GitHub: $REMOTE_URL"

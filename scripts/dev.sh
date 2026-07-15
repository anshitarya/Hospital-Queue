#!/usr/bin/env bash
# One-command dev startup: ensures Docker is up, starts Postgres + Redis,
# frees ports, then launches API and web in parallel with live output.
#
# Usage: ./scripts/dev.sh
#        ./scripts/dev.sh --api-only    (skip web)
#        ./scripts/dev.sh --web-only    (skip API)

set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

API_ONLY=0; WEB_ONLY=0
for arg in "$@"; do
  [[ "$arg" == "--api-only" ]] && API_ONLY=1
  [[ "$arg" == "--web-only" ]] && WEB_ONLY=1
done

# ── 1. Wait for Postgres to be reachable ──────────────────────────────────
# Start Docker + `docker compose up -d postgres redis` manually before running this.
echo -n "▶ Waiting for Postgres on 127.0.0.1:5432"
until nc -z 127.0.0.1 5432 2>/dev/null; do printf '.'; sleep 1; done
echo " ✓"

# ── 2. Free ports ──────────────────────────────────────────────────────────
echo "▶ Freeing ports..."
lsof -ti :4001 | xargs kill -9 2>/dev/null && echo "  killed stale :4001" || true
lsof -ti :3000 | xargs kill -9 2>/dev/null && echo "  killed stale :3000" || true

# ── 4. Launch services ─────────────────────────────────────────────────────
if [[ $WEB_ONLY -eq 0 ]]; then
  echo "▶ Starting API on :4001..."
  (cd apps/api && npm run start:dev 2>&1 | sed 's/^/[api] /') &
  API_PID=$!
fi

if [[ $API_ONLY -eq 0 ]]; then
  echo "▶ Starting Web on :3000..."
  (cd apps/web && npm run dev 2>&1 | sed 's/^/[web] /') &
  WEB_PID=$!
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  API  → http://localhost:4001"
echo "  Web  → http://localhost:3000"
echo "  Ctrl+C to stop everything"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Clean shutdown on Ctrl+C
trap 'echo ""; echo "Stopping..."; kill $API_PID $WEB_PID 2>/dev/null; exit 0' INT TERM

wait

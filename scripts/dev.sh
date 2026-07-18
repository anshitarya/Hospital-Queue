#!/usr/bin/env bash
# One-command dev startup: starts Postgres + Redis (Docker), frees ports,
# then launches API and web in parallel with live output.
#
# Usage: ./scripts/dev.sh
#        ./scripts/dev.sh --api-only    (skip web)
#        ./scripts/dev.sh --web-only    (skip API)

set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

# Rancher Desktop installs docker at ~/.rd/bin — add if missing from PATH
if [[ -x "$HOME/.rd/bin/docker" ]]; then
  export PATH="$HOME/.rd/bin:$PATH"
fi

API_ONLY=0; WEB_ONLY=0
for arg in "$@"; do
  [[ "$arg" == "--api-only" ]] && API_ONLY=1
  [[ "$arg" == "--web-only" ]] && WEB_ONLY=1
done

# ── 1. Postgres + Redis (Docker) ───────────────────────────────────────────
ensure_db() {
  if nc -z 127.0.0.1 5432 2>/dev/null && nc -z 127.0.0.1 6379 2>/dev/null; then
    echo "▶ Postgres + Redis already up"
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "✗ Postgres is not running on 127.0.0.1:5432 and Docker is not installed."
    echo "  Install Rancher Desktop or Docker Desktop, or run Postgres locally."
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "▶ Docker daemon not running — starting container runtime…"
    open -a "Rancher Desktop" 2>/dev/null || open -a Docker 2>/dev/null || true
    echo -n "  Waiting for Docker (up to 2 min)"
    for _ in $(seq 1 60); do
      docker info >/dev/null 2>&1 && break
      printf '.'
      sleep 2
    done
    echo ""
    if ! docker info >/dev/null 2>&1; then
      echo "✗ Docker is not running."
      echo "  → Open Rancher Desktop and wait until it shows Running"
      echo "  → Then run: docker compose up -d postgres redis"
      echo "  → Re-run: ./scripts/dev.sh"
      exit 1
    fi
  fi

  echo "▶ Starting Postgres + Redis (docker compose)…"
  docker compose up -d postgres redis

  echo -n "▶ Waiting for Postgres on 127.0.0.1:5432"
  for _ in $(seq 1 45); do
    nc -z 127.0.0.1 5432 2>/dev/null && break
    printf '.'
    sleep 1
  done
  echo ""
  if ! nc -z 127.0.0.1 5432 2>/dev/null; then
    echo "✗ Postgres did not become ready. Check: docker compose logs postgres"
    exit 1
  fi
  echo "▶ Postgres ready ✓"
}

ensure_db

# ── 2. Free ports ──────────────────────────────────────────────────────────
echo "▶ Freeing ports..."
lsof -ti :4000 | xargs kill -9 2>/dev/null && echo "  killed stale :4000" || true
lsof -ti :3000 | xargs kill -9 2>/dev/null && echo "  killed stale :3000" || true

# ── 3. Launch services ─────────────────────────────────────────────────────
if [[ $WEB_ONLY -eq 0 ]]; then
  echo "▶ Starting API on :4000..."
  (cd apps/api && API_PORT=4000 npm run start:dev 2>&1 | sed 's/^/[api] /') &
  API_PID=$!
fi

if [[ $API_ONLY -eq 0 ]]; then
  echo "▶ Starting Web on :3000..."
  (cd apps/web && npm run dev 2>&1 | sed 's/^/[web] /') &
  WEB_PID=$!
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  API  → http://localhost:4000"
echo "  Web  → http://localhost:3000"
echo "  Ctrl+C to stop everything"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

trap 'echo ""; echo "Stopping..."; kill $API_PID $WEB_PID 2>/dev/null; exit 0' INT TERM

wait

#!/usr/bin/env bash
# One-command dev startup: starts Postgres + Redis (Homebrew or Docker), syncs
# the schema, then launches API and web in parallel with live output.
#
# Usage: ./scripts/dev.sh
#        ./scripts/dev.sh --api-only    (skip web)
#        ./scripts/dev.sh --web-only    (skip API)
#        ./scripts/dev.sh --native-only (skip Docker; use Homebrew services)

set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

# Rancher Desktop installs docker at ~/.rd/bin — add if missing from PATH
if [[ -x "$HOME/.rd/bin/docker" ]]; then
  export PATH="$HOME/.rd/bin:$PATH"
fi
# Homebrew Postgres is keg-only
if [[ -d /opt/homebrew/opt/postgresql@16/bin ]]; then
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi

API_ONLY=0; WEB_ONLY=0; NATIVE_ONLY=0
for arg in "$@"; do
  [[ "$arg" == "--api-only" ]] && API_ONLY=1
  [[ "$arg" == "--web-only" ]] && WEB_ONLY=1
  [[ "$arg" == "--native-only" ]] && NATIVE_ONLY=1
done

wait_for_port() {
  local port=$1 label=$2 max=${3:-45}
  echo -n "▶ Waiting for $label on 127.0.0.1:$port"
  for _ in $(seq 1 "$max"); do
    nc -z 127.0.0.1 "$port" 2>/dev/null && { echo " ✓"; return 0; }
    printf '.'
    sleep 1
  done
  echo ""
  return 1
}

ensure_native_db() {
  if ! command -v brew >/dev/null 2>&1; then
    echo "✗ Homebrew is required for native Postgres/Redis when Docker is unavailable."
    exit 1
  fi

  if ! brew list --formula postgresql@16 >/dev/null 2>&1; then
    echo "▶ Installing Postgres 16 (Homebrew)…"
    brew install postgresql@16
  fi
  if ! brew list --formula redis >/dev/null 2>&1; then
    echo "▶ Installing Redis (Homebrew)…"
    brew install redis
  fi

  brew services start postgresql@16 >/dev/null 2>&1 || true
  brew services start redis >/dev/null 2>&1 || true

  wait_for_port 5432 Postgres 60 || {
    echo "✗ Postgres did not become ready. Try: brew services restart postgresql@16"
    exit 1
  }
  wait_for_port 6379 Redis 30 || {
    echo "✗ Redis did not become ready. Try: brew services restart redis"
    exit 1
  }

  if ! psql postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='hq'" 2>/dev/null | grep -q 1; then
    echo "▶ Creating local Postgres role/database (hq / hospital_queue)…"
    psql postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hq') THEN
    CREATE ROLE hq LOGIN PASSWORD 'hq_dev_password';
  END IF;
END
$$;
SELECT 'CREATE DATABASE hospital_queue OWNER hq'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hospital_queue')\gexec
GRANT ALL PRIVILEGES ON DATABASE hospital_queue TO hq;
SQL
  fi
}

ensure_docker_db() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
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
    docker info >/dev/null 2>&1 || return 1
  fi

  echo "▶ Starting Postgres + Redis (docker compose)…"
  docker compose up -d postgres redis
  wait_for_port 5432 Postgres 45 || return 1
  wait_for_port 6379 Redis 30 || return 1
}

ensure_db() {
  if nc -z 127.0.0.1 5432 2>/dev/null && nc -z 127.0.0.1 6379 2>/dev/null; then
    echo "▶ Postgres + Redis already up"
    return 0
  fi

  if [[ $NATIVE_ONLY -eq 0 ]] && ensure_docker_db; then
    echo "▶ Postgres + Redis ready (Docker) ✓"
    return 0
  fi

  echo "▶ Using Homebrew Postgres + Redis (no Docker)…"
  ensure_native_db
  echo "▶ Postgres + Redis ready (Homebrew) ✓"
}

sync_api_schema() {
  if [[ $WEB_ONLY -eq 1 ]]; then
    return 0
  fi
  echo "▶ Syncing API schema + seed…"
  (cd apps/api && npx prisma db push --skip-generate --accept-data-loss >/dev/null && npx prisma db seed)
}

ensure_db
sync_api_schema

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
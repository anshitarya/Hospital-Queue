#!/usr/bin/env bash
# One-command dev startup: starts Postgres + Redis, syncs schema, then launches API and web.
# Note: For parallel output, we recommend running API and Web in separate terminal tabs

set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

# PATH setup
if [[ -d /opt/homebrew/bin ]]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi
if [[ -x "$HOME/.rd/bin/docker" ]]; then
  export PATH="$HOME/.rd/bin:$PATH"
fi
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
    printf '.'; sleep 1
  done
  echo ""; return 1
}

ensure_native_db() {
  if ! command -v brew >/dev/null 2>&1; then
    echo "✗ Homebrew required"; exit 1
  fi
  if ! brew list --formula postgresql@16 >/dev/null 2>&1; then
    echo "▶ Installing Postgres 16…"; brew install postgresql@16
  fi
  if ! brew list --formula redis >/dev/null 2>&1; then
    echo "▶ Installing Redis…"; brew install redis
  fi
  brew services start postgresql@16 >/dev/null 2>&1 || true
  brew services start redis >/dev/null 2>&1 || true
  wait_for_port 5432 Postgres 60 || { echo "✗ Postgres failed"; exit 1; }
  wait_for_port 6379 Redis 30 || { echo "✗ Redis failed"; exit 1; }
  if ! psql postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='hq'" 2>/dev/null | grep -q 1; then
    echo "▶ Creating Postgres role/database…"
    psql postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hq') THEN CREATE ROLE hq LOGIN PASSWORD 'hq_dev_password'; END IF; END $$;
SELECT 'CREATE DATABASE hospital_queue OWNER hq' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hospital_queue')\gexec
GRANT ALL PRIVILEGES ON DATABASE hospital_queue TO hq;
SQL
  fi
}

ensure_docker_db() {
  if ! command -v docker >/dev/null 2>&1; then return 1; fi
  if ! docker info >/dev/null 2>&1; then
    echo "▶ Starting Docker…"
    open -a "Rancher Desktop" 2>/dev/null || open -a Docker 2>/dev/null || true
    echo -n "  Waiting..."
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; printf '.'; sleep 2; done
    echo ""; docker info >/dev/null 2>&1 || return 1
  fi
  echo "▶ Starting Postgres + Redis (docker)…"
  docker compose up -d postgres redis
  wait_for_port 5432 Postgres 45 || return 1
  wait_for_port 6379 Redis 30 || return 1
}

ensure_db() {
  if nc -z 127.0.0.1 5432 2>/dev/null && nc -z 127.0.0.1 6379 2>/dev/null; then
    echo "▶ Postgres + Redis already up"; return 0
  fi
  if [[ $NATIVE_ONLY -eq 0 ]] && ensure_docker_db; then
    echo "▶ Postgres + Redis ready (Docker) ✓"; return 0
  fi
  echo "▶ Using Homebrew Postgres + Redis…"
  ensure_native_db
  echo "▶ Postgres + Redis ready (Homebrew) ✓"
}

sync_api_schema() {
  if [[ $WEB_ONLY -eq 1 ]]; then return 0; fi
  echo "▶ Syncing API schema + seed…"
  (cd apps/api && npx prisma db push --skip-generate --accept-data-loss >/dev/null && npx prisma db seed)
}

ensure_db
sync_api_schema

echo "▶ Freeing ports..."
lsof -ti :4000 | xargs kill -9 2>/dev/null && echo "  killed :4000" || true
lsof -ti :3000 | xargs kill -9 2>/dev/null && echo "  killed :3000" || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  API  → http://localhost:4000"
echo "  Web  → http://localhost:3000"
echo "  Ctrl+C to stop everything"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Launch services
export PATH="/opt/homebrew/bin:$PATH"

if [[ $API_ONLY -eq 0 ]] && [[ $WEB_ONLY -eq 0 ]]; then
  echo "Starting both API and Web..."
  echo "(Tip: Open another terminal and run './scripts/dev.sh --api-only' for better output)"
  echo ""
  (
    cd apps/api && API_PORT=4000 npm run start:dev &
    API_PID=$!
    cd ../web && npm run dev &
    WEB_PID=$!
    trap "kill $API_PID $WEB_PID 2>/dev/null || true" INT TERM
    wait
  )
elif [[ $API_ONLY -eq 1 ]]; then
  cd apps/web && npm run dev
else
  cd apps/api && API_PORT=4000 npm run start:dev
fi

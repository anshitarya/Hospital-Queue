#!/usr/bin/env bash
set -euo pipefail
REPO="/workspace"
cd "$REPO"

load_env() {
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    line="${line%%#*}"
    line="${line%"${line##*[![:space:]]}"}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ "$line" == *=* ]] || continue
    export "$line"
  done < "$REPO/.env"
}

load_env
export DATABASE_URL="${DATABASE_URL/postgres:5432/localhost:5432}"
export REDIS_URL="${REDIS_URL/redis:6379/localhost:6379}"
export NODE_ENV=development

sudo service postgresql start >/dev/null 2>&1 || true
sudo service redis-server start >/dev/null 2>&1 || true

wait_port() {
  local port=$1 max=${2:-60}
  for _ in $(seq 1 "$max"); do
    nc -z 127.0.0.1 "$port" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='hq'" 2>/dev/null | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
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

wait_port 5432 60 || { echo "Postgres not ready"; exit 1; }
wait_port 6379 30 || { echo "Redis not ready"; exit 1; }

echo "▶ Syncing API schema + seed…"
(
  cd "$REPO/apps/api"
  npx prisma db push --skip-generate --accept-data-loss >/dev/null
  npx prisma db seed >/dev/null
)

API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"

for port in "$API_PORT" "$WEB_PORT" 4002 4003; do
  lsof -ti :"$port" | xargs -r kill -9 2>/dev/null || true
done

TMUX="tmux -f /exec-daemon/tmux.portal.conf"

start_tmux() {
  local name=$1 cmd=$2
  $TMUX has-session -t "$name" 2>/dev/null && return 0
  $TMUX new-session -d -s "$name" -c "$REPO" -- bash -lc "$cmd"
}

start_tmux api "cd apps/api && PORT=${API_PORT} npm run start:dev 2>&1 | tee /tmp/hq-api.log"
start_tmux web "cd apps/web && PORT=${WEB_PORT} npm run dev 2>&1 | tee /tmp/hq-web.log"
start_tmux prescription "cd apps/prescription-service && PORT=4002 npm run start:dev 2>&1 | tee /tmp/hq-prescription.log"
start_tmux notification "cd apps/notification-service && PORT=4003 npm run start:dev 2>&1 | tee /tmp/hq-notification.log"

for _ in $(seq 1 90); do
  nc -z 127.0.0.1 "$API_PORT" 2>/dev/null && nc -z 127.0.0.1 "$WEB_PORT" 2>/dev/null && break
  sleep 2
done

nc -z 127.0.0.1 "$API_PORT" || { echo "API failed to bind :$API_PORT"; tail -30 /tmp/hq-api.log; exit 1; }
nc -z 127.0.0.1 "$WEB_PORT" || { echo "Web failed to bind :$WEB_PORT"; tail -30 /tmp/hq-web.log; exit 1; }

echo "Hospital Queue ready — web :$WEB_PORT, API :$API_PORT"

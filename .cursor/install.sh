#!/usr/bin/env bash
set -euo pipefail
cd /workspace

# System deps (idempotent; no-op when already installed from snapshot)
if ! command -v psql >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    postgresql postgresql-contrib redis-server netcat-openbsd
fi

# Local dev env (localhost DB/Redis instead of Docker service names)
if [[ ! -f .env ]]; then
  cp .env.example .env
  sed -i 's|@postgres:5432|@localhost:5432|g; s|redis://redis:6379|redis://localhost:6379|g' .env
fi

for app in apps/api apps/web apps/prescription-service apps/notification-service; do
  (cd "$app" && npm ci --no-audit --no-fund)
done

cd apps/api
npx prisma generate
npm run build

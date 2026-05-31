#!/usr/bin/env bash
# ── deploy.sh ─────────────────────────────────────────────────────────────────
# Push a new version to production.
#
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh deploy@<SERVER_IP>
#
# What it does:
#   1. SSH into the server
#   2. Pull latest code from git
#   3. Rebuild and restart changed containers (zero downtime per service)
#
# Requirements:
#   - SSH key-based access to the deploy user
#   - Repo already cloned at /srv/hq on the server
#   - .env already placed at /srv/hq/.env
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REMOTE="${1:-}"
if [[ -z "$REMOTE" ]]; then
  echo "Usage: ./scripts/deploy.sh deploy@<SERVER_IP>"
  exit 1
fi

APP_DIR="/srv/hq"
COMPOSE_FILE="docker-compose.prod.yml"

echo "▶ Deploying to $REMOTE..."

ssh -o StrictHostKeyChecking=accept-new "$REMOTE" bash <<ENDSSH
  set -euo pipefail

  echo "── Pulling latest code ──────────────────────────────────────────"
  cd $APP_DIR
  git pull --ff-only

  echo "── Building & restarting services ──────────────────────────────"
  docker compose -f $COMPOSE_FILE up -d --build --remove-orphans

  echo "── Waiting for API to become healthy ───────────────────────────"
  for i in \$(seq 1 30); do
    if docker compose -f $COMPOSE_FILE exec -T api curl -sf http://localhost:4000/api/auth/me > /dev/null 2>&1; then
      echo "   API is up."
      break
    fi
    if [ \$i -eq 30 ]; then
      echo "   API health check timed out. Check logs:"
      docker compose -f $COMPOSE_FILE logs --tail=50 api
      exit 1
    fi
    sleep 3
  done

  echo "── Pruning unused images ────────────────────────────────────────"
  docker image prune -f

  echo ""
  echo "✅ Deploy complete."
  docker compose -f $COMPOSE_FILE ps
ENDSSH

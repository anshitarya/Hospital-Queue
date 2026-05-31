#!/usr/bin/env bash
# ── backup-db.sh ──────────────────────────────────────────────────────────────
# Dump the Postgres database to /srv/hq/backups/.
# Run manually or via cron: 0 2 * * * /srv/hq/scripts/backup-db.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/srv/hq"
BACKUP_DIR="$APP_DIR/backups"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/hq_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "▶ Dumping database to $FILE..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-hq}" "${POSTGRES_DB:-hospital_queue}" \
  | gzip > "$FILE"

echo "✅ Backup saved: $FILE ($(du -sh "$FILE" | cut -f1))"

# Keep only last 14 backups.
cd "$BACKUP_DIR"
ls -t hq_*.sql.gz | tail -n +15 | xargs -r rm --
echo "   Retained $(ls hq_*.sql.gz | wc -l) backup(s)."

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HospitalQueue — Fly.io deploy script
#
# Usage:
#   ./fly-deploy.sh                      # uses default production app names (turnos-api-hq / turnos)
#   ./fly-deploy.sh myname               # uses myname-hq-api / myname-hq-web for preprod/test
#
# Prerequisites (run once on your personal laptop):
#   brew install flyctl
#   flyctl auth login
# ─────────────────────────────────────────────────────────────────────────────

set -e

PREFIX=${1:-""}
if [ -z "$PREFIX" ]; then
  API_APP="turnos-api-hq"
  WEB_APP="turnos"
  PRESCRIPTION_APP="turnos-prescription-hq"
  NOTIFICATION_APP="turnos-notification-hq"
  DB_APP="queue-hq-db"
  HA_FLAG=""
else
  API_APP="${PREFIX}-hq-api"
  WEB_APP="${PREFIX}-hq-web"
  PRESCRIPTION_APP="${PREFIX}-hq-prescription"
  NOTIFICATION_APP="${PREFIX}-hq-notification"
  DB_APP="${PREFIX}-hq-db"
  HA_FLAG="--ha=false"
fi
REGION="sin"

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  HospitalQueue (Prod/Preprod) → Fly.io"
echo "  API          : $API_APP.fly.dev"
echo "  Web          : $WEB_APP.fly.dev"
echo "  Prescription : $PRESCRIPTION_APP"
echo "  Notification : $NOTIFICATION_APP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Patch fly.toml app names ───────────────────────────────────────────────
sed -i.bak "s/^app *= *\"[^\"]*\"/app = \"$API_APP\"/" "$REPO_ROOT/apps/api/fly.toml"
sed -i.bak "s/^app *= *\"[^\"]*\"/app = \"$WEB_APP\"/" "$REPO_ROOT/apps/web/fly.toml"
sed -i.bak "s/^app *= *\"[^\"]*\"/app = \"$PRESCRIPTION_APP\"/" "$REPO_ROOT/apps/prescription-service/fly.toml"
sed -i.bak "s/^app *= *\"[^\"]*\"/app = \"$NOTIFICATION_APP\"/" "$REPO_ROOT/apps/notification-service/fly.toml"
sed -i.bak "s|https://[^/]*\.fly\.dev|https://${API_APP}.fly.dev|g" "$REPO_ROOT/apps/web/fly.toml"
rm -f "$REPO_ROOT/apps/api/fly.toml.bak" "$REPO_ROOT/apps/web/fly.toml.bak" \
      "$REPO_ROOT/apps/prescription-service/fly.toml.bak" "$REPO_ROOT/apps/notification-service/fly.toml.bak"
echo "✔ Patched fly.toml files with resolved app names"

# ── 2. Create Fly apps ────────────────────────────────────────────────────────
echo ""
echo "▶ Creating Fly apps..."
flyctl apps create "$API_APP" --machines 2>/dev/null || echo "  (API app already exists)"
flyctl apps create "$WEB_APP" --machines 2>/dev/null || echo "  (Web app already exists)"
flyctl apps create "$PRESCRIPTION_APP" --machines 2>/dev/null || echo "  (Prescription app already exists)"
flyctl apps create "$NOTIFICATION_APP" --machines 2>/dev/null || echo "  (Notification app already exists)"

# ── 3. Provision Postgres ─────────────────────────────────────────────────────
echo ""
echo "▶ Provisioning Postgres (this takes ~2 min)..."
flyctl postgres create \
  --name "$DB_APP" \
  --region "$REGION" \
  --vm-size shared-cpu-1x \
  --volume-size 1 \
  --initial-cluster-size 1 2>/dev/null || echo "  (Postgres already exists)"

echo ""
echo "▶ Attaching Postgres to API app..."
flyctl postgres attach "$DB_APP" --app "$API_APP" 2>/dev/null \
  || echo "  (Already attached or DATABASE_URL already set)"

echo "▶ Attaching Postgres to Prescription Worker app..."
flyctl postgres attach "$DB_APP" --app "$PRESCRIPTION_APP" 2>/dev/null \
  || echo "  (Already attached or DATABASE_URL already set)"

# ── 4. Provision Redis ────────────────────────────────────────────────────────
echo ""
echo "▶ Provisioning Redis (Upstash)..."
REDIS_URL=$(flyctl redis create \
  --name "${PREFIX:+${PREFIX}-}hq-redis" \
  --region "$REGION" \
  --no-replicas \
  --enable-prodpack=false \
  --enable-auto-upgrade=false \
  --enable-eviction \
  2>&1 | grep "redis://" | head -1 | tr -d ' ')

if [ -n "$REDIS_URL" ]; then
  flyctl secrets set REDIS_URL="$REDIS_URL" --app "$API_APP" || true
  flyctl secrets set REDIS_URL="$REDIS_URL" --app "$PRESCRIPTION_APP" || true
  flyctl secrets set REDIS_URL="$REDIS_URL" --app "$NOTIFICATION_APP" || true
  echo "  ✔ Redis URL set across apps"
else
  echo ""
  echo "  ⚠ Could not auto-detect Redis URL. Fetching status..."
  REDIS_STATUS_URL=$(flyctl redis status "${PREFIX:+${PREFIX}-}hq-redis" 2>/dev/null | grep "redis://" | head -1 | tr -d ' ')
  if [ -n "$REDIS_STATUS_URL" ]; then
    flyctl secrets set REDIS_URL="$REDIS_STATUS_URL" --app "$API_APP" || true
    flyctl secrets set REDIS_URL="$REDIS_STATUS_URL" --app "$PRESCRIPTION_APP" || true
    flyctl secrets set REDIS_URL="$REDIS_STATUS_URL" --app "$NOTIFICATION_APP" || true
    echo "  ✔ Redis URL recovered and set"
  else
    echo "  ⚠ Redis credentials must be linked manually when deployment completes."
  fi
fi

# ── 5. Set App Secrets ────────────────────────────────────────────────────────
echo ""
echo "▶ Configuring application secrets..."
JWT_SECRET=$(openssl rand -hex 32)
if [ -z "$PREFIX" ]; then
  flyctl secrets set \
    JWT_SECRET="$JWT_SECRET" \
    CORS_ORIGIN="https://turnos.in,https://www.turnos.in,https://turnos.fly.dev" \
    --app "$API_APP"
else
  flyctl secrets set \
    JWT_SECRET="$JWT_SECRET" \
    CORS_ORIGIN="https://${WEB_APP}.fly.dev" \
    --app "$API_APP"
fi
echo "  ✔ JWT_SECRET and CORS_ORIGIN set on API"

# Sync local .env variables to Fly apps
if [ -f "$REPO_ROOT/.env" ]; then
  echo "  (Syncing credentials from local .env to Fly.io apps...)"
  
  KEYS_TO_SET=(
    "OPENAI_API_KEY"
    "S3_ACCESS_KEY_ID" "S3_SECRET_ACCESS_KEY" "S3_ENDPOINT" "S3_BUCKET_NAME" "S3_REGION" "S3_PUBLIC_URL"
    "META_WA_ACCESS_TOKEN" "META_WA_PHONE_NUMBER_ID"
    "MSG91_AUTH_KEY" "MSG91_SENDER_ID" "MSG91_WIDGET_ID"
    "RAZORPAY_KEY_ID" "RAZORPAY_KEY_SECRET" "RAZORPAY_WEBHOOK_SECRET"
  )
  
  SECRETS_STRING=""
  for key in "${KEYS_TO_SET[@]}"; do
    val=$(grep -E "^${key}=" "$REPO_ROOT/.env" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
    if [ -n "$val" ]; then
      SECRETS_STRING="${SECRETS_STRING} ${key}=${val}"
    fi
  done
  
  if [ -n "$SECRETS_STRING" ]; then
    flyctl secrets set $SECRETS_STRING --app "$API_APP" >/dev/null 2>&1 || true
    flyctl secrets set $SECRETS_STRING --app "$PRESCRIPTION_APP" >/dev/null 2>&1 || true
    flyctl secrets set $SECRETS_STRING --app "$NOTIFICATION_APP" >/dev/null 2>&1 || true
    echo "  ✔ Shared credential secrets populated across all apps"
  fi
fi

# ── 6. Deploy API Gateway ─────────────────────────────────────────────────────
echo ""
echo "▶ Deploying API (building on Fly's servers, ~3-5 min)..."
cd "$REPO_ROOT/apps/api"
flyctl deploy --remote-only --app "$API_APP" ${HA_FLAG}
cd "$REPO_ROOT"

# ── 7. Deploy Prescription Worker ─────────────────────────────────────────────
echo ""
echo "▶ Deploying Prescription Worker (~2-4 min)..."
cd "$REPO_ROOT/apps/prescription-service"
flyctl deploy --remote-only --app "$PRESCRIPTION_APP" ${HA_FLAG}
cd "$REPO_ROOT"

# ── 8. Deploy Notification Worker ─────────────────────────────────────────────
echo ""
echo "▶ Deploying Notification Worker (~2-4 min)..."
cd "$REPO_ROOT/apps/notification-service"
flyctl deploy --remote-only --app "$NOTIFICATION_APP" ${HA_FLAG}
cd "$REPO_ROOT"

# ── 9. Deploy Web Client ──────────────────────────────────────────────────────
echo ""
echo "▶ Deploying Web Client (building on Fly's servers, ~3-5 min)..."
cd "$REPO_ROOT/apps/web"
if [ -z "$PREFIX" ]; then
  flyctl deploy --remote-only --app "$WEB_APP" \
    --build-arg "NEXT_PUBLIC_API_URL=https://api.turnos.in" \
    --build-arg "NEXT_PUBLIC_SOCKET_URL=https://api.turnos.in"
else
  flyctl deploy --remote-only --app "$WEB_APP" ${HA_FLAG} \
    --build-arg "NEXT_PUBLIC_API_URL=https://${API_APP}.fly.dev" \
    --build-arg "NEXT_PUBLIC_SOCKET_URL=https://${API_APP}.fly.dev"
fi
cd "$REPO_ROOT"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ HospitalQueue is live on Fly.io!"
echo ""
echo "  🌐 Web Client : https://${WEB_APP}.fly.dev"
echo "  ⚙️  API Gateway: https://${API_APP}.fly.dev"
echo ""
echo "  To tear down everything when done:"
echo "    flyctl apps destroy $API_APP"
echo "    flyctl apps destroy $WEB_APP"
echo "    flyctl apps destroy $PRESCRIPTION_APP"
echo "    flyctl apps destroy $NOTIFICATION_APP"
echo "    flyctl postgres destroy $DB_APP"
echo "    flyctl redis destroy ${PREFIX:+${PREFIX}-}hq-redis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

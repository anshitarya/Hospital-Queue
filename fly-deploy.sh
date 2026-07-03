#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HospitalQueue — Fly.io deploy script
#
# Usage:
#   ./fly-deploy.sh                      # uses default app names (hq-api / hq-web)
#   ./fly-deploy.sh myname               # uses myname-hq-api / myname-hq-web
#
# Prerequisites (run once on your personal laptop):
#   brew install flyctl
#   flyctl auth login
# ─────────────────────────────────────────────────────────────────────────────

set -e

PREFIX=${1:-""}
API_APP="${PREFIX:+${PREFIX}-}hq-api"
WEB_APP="${PREFIX:+${PREFIX}-}hq-web"
DB_APP="${PREFIX:+${PREFIX}-}hq-db"
REGION="bom"

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  HospitalQueue → Fly.io"
echo "  API : $API_APP.fly.dev"
echo "  Web : $WEB_APP.fly.dev"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Patch fly.toml app names if a prefix was given ─────────────────────────
if [ -n "$PREFIX" ]; then
  sed -i.bak "s/^app *= *\"hq-api\"/app = \"$API_APP\"/" "$REPO_ROOT/apps/api/fly.toml"
  sed -i.bak "s/^app *= *\"hq-web\"/app = \"$WEB_APP\"/" "$REPO_ROOT/apps/web/fly.toml"
  sed -i.bak "s|https://hq-api\.fly\.dev|https://${API_APP}.fly.dev|g" "$REPO_ROOT/apps/web/fly.toml"
  rm -f "$REPO_ROOT/apps/api/fly.toml.bak" "$REPO_ROOT/apps/web/fly.toml.bak"
  echo "✔ Patched fly.toml files with prefix: $PREFIX"
fi

# ── 2. Create Fly apps ────────────────────────────────────────────────────────
echo ""
echo "▶ Creating Fly apps..."
flyctl apps create "$API_APP" --machines 2>/dev/null || echo "  (API app already exists)"
flyctl apps create "$WEB_APP" --machines 2>/dev/null || echo "  (Web app already exists)"

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

# ── 4. Provision Redis ────────────────────────────────────────────────────────
echo ""
echo "▶ Provisioning Redis (Upstash)..."
REDIS_URL=$(flyctl redis create \
  --name "${PREFIX:+${PREFIX}-}hq-redis" \
  --region "$REGION" \
  --no-replicas 2>&1 | grep "redis://" | head -1 | tr -d ' ')

if [ -n "$REDIS_URL" ]; then
  flyctl secrets set REDIS_URL="$REDIS_URL" --app "$API_APP"
  echo "  ✔ Redis URL set"
else
  echo ""
  echo "  ⚠ Could not auto-detect Redis URL."
  echo "  Run: flyctl redis status ${PREFIX:+${PREFIX}-}hq-redis"
  echo "  Then: flyctl secrets set REDIS_URL=<url> --app $API_APP"
  echo ""
fi

# ── 5. Set API secrets ────────────────────────────────────────────────────────
echo ""
echo "▶ Setting API secrets..."
JWT_SECRET=$(openssl rand -hex 32)
flyctl secrets set \
  JWT_SECRET="$JWT_SECRET" \
  CORS_ORIGIN="https://${WEB_APP}.fly.dev" \
  --app "$API_APP"
echo "  ✔ JWT_SECRET and CORS_ORIGIN set"

# ── 6. Deploy API ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Deploying API (building on Fly's servers, ~3-5 min)..."
cd "$REPO_ROOT/apps/api"
flyctl deploy --remote-only --app "$API_APP"
cd "$REPO_ROOT"

# ── 7. Deploy Web ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Deploying Web (building on Fly's servers, ~3-5 min)..."
cd "$REPO_ROOT/apps/web"
flyctl deploy --remote-only --app "$WEB_APP" \
  --build-arg "NEXT_PUBLIC_API_URL=https://${API_APP}.fly.dev" \
  --build-arg "NEXT_PUBLIC_SOCKET_URL=https://${API_APP}.fly.dev"
cd "$REPO_ROOT"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ HospitalQueue is live!"
echo ""
echo "  🌐 Web  →  https://${WEB_APP}.fly.dev"
echo "  ⚙️  API  →  https://${API_APP}.fly.dev"
echo ""
echo "  Share the Web URL with the clinic."
echo ""
echo "  To tear down everything when done:"
echo "    flyctl apps destroy $API_APP"
echo "    flyctl apps destroy $WEB_APP"
echo "    flyctl postgres destroy $DB_APP"
echo "    flyctl redis destroy ${PREFIX:+${PREFIX}-}hq-redis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

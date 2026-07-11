#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Fix Upstash Redis cost on Fly.io and recover REDIS_URL after cleanup mistakes.
#
# Canonical Redis for turnos-api-hq: queue-hq-redis (fly-queue-hq-redis.upstash.io)
#
# Usage:
#   ./scripts/fly-redis-fix.sh
#
# Prerequisites: flyctl auth login
# ─────────────────────────────────────────────────────────────────────────────

set -e

CANONICAL_REDIS="queue-hq-redis"
CANONICAL_HOST="fly-${CANONICAL_REDIS}.upstash.io"
API_APP="turnos-api-hq"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Fly Redis fix — $API_APP"
echo "  Canonical DB: $CANONICAL_REDIS ($CANONICAL_HOST)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "▶ Step 0 — Redis instances"
flyctl redis list
echo ""

if ! flyctl redis status "$CANONICAL_REDIS" >/dev/null 2>&1; then
  echo "  ✖ $CANONICAL_REDIS not found."
  echo "    Recreate: flyctl redis create --name $CANONICAL_REDIS --region bom --no-replicas --enable-prodpack=false --enable-auto-upgrade=false --enable-eviction"
  exit 1
fi

PRIVATE_URL=$(flyctl redis status "$CANONICAL_REDIS" 2>/dev/null | grep "Private URL" | sed 's/.*│ *//' | tr -d ' ')

echo "▶ Step 1 — Set REDIS_URL (no leading/trailing spaces!)"
echo "  Canonical URL host: $CANONICAL_HOST"
echo ""
read -r -p "Update REDIS_URL secret now? [Y/n] " set_secret
set_secret=${set_secret:-Y}
if [[ "$set_secret" =~ ^[Yy]$ ]]; then
  if [[ -z "$PRIVATE_URL" || "$PRIVATE_URL" != *"$CANONICAL_HOST"* ]]; then
    read -r -p "Paste Private URL from 'flyctl redis status $CANONICAL_REDIS': " PRIVATE_URL
  fi
  PRIVATE_URL=$(echo "$PRIVATE_URL" | xargs)
  if [[ -n "$PRIVATE_URL" && "$PRIVATE_URL" == *"$CANONICAL_HOST"* ]]; then
    flyctl secrets set REDIS_URL="$PRIVATE_URL" --app "$API_APP"
    echo "  ✔ REDIS_URL set"
  else
    echo "  ✖ Invalid URL — must contain $CANONICAL_HOST"
    exit 1
  fi
fi
echo ""

echo "▶ Step 2 — Machines (remove stray non-BOM machines if any)"
flyctl machines list --app "$API_APP"
echo ""
echo "  If a machine is in lhr/sin while Redis is bom, destroy the foreign one:"
echo "    flyctl machine destroy <machine-id> --app $API_APP --force"
echo ""

echo "▶ Step 3 — Prod Pack should be Disabled (check Upstash dashboard if not)"
flyctl redis status "$CANONICAL_REDIS" | grep -i prod || true
echo ""

echo "▶ Step 4 — Redeploy API (fixes stuck health checks after bad secret)"
echo "    cd apps/api && flyctl deploy --remote-only --app $API_APP --region bom"
echo ""
read -r -p "Run deploy now? [Y/n] " do_deploy
do_deploy=${do_deploy:-Y}
if [[ "$do_deploy" =~ ^[Yy]$ ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  cd "$SCRIPT_DIR/../apps/api"
  flyctl deploy --remote-only --app "$API_APP" --region bom
  cd - >/dev/null
fi
echo ""

echo "▶ Step 5 — Verify"
echo "  REDIS_URL host:"
flyctl ssh console -a "$API_APP" -C "printenv REDIS_URL" 2>/dev/null | grep -o 'fly-[^.]*\.upstash\.io' || echo "  (could not read)"
echo ""
echo "  Health:"
echo "    curl https://${API_APP}.fly.dev/api/health"
echo "    curl https://${API_APP}.fly.dev/api/ready"
echo ""
echo "  If deploy still times out, check logs:"
echo "    flyctl logs --app $API_APP --no-tail"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

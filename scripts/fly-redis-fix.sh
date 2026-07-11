#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Fix Upstash Redis cost on Fly.io and recover REDIS_URL after cleanup mistakes.
#
# Canonical Redis for turnos-api-hq: queue-hq-redis (fly-queue-hq-redis.upstash.io)
# Created by fly-deploy.sh with PREFIX=queue.
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

echo "▶ Step 0 — What Redis instances exist?"
flyctl redis list
echo ""

if ! flyctl redis status "$CANONICAL_REDIS" >/dev/null 2>&1; then
  echo "  ✖ $CANONICAL_REDIS not found."
  echo "    Recreate: flyctl redis create --name $CANONICAL_REDIS --region bom --no-replicas --enable-prodpack=false --enable-auto-upgrade=false --enable-eviction"
  echo "    Then re-run this script."
  exit 1
fi

echo "▶ Step 1 — Check live REDIS_URL on $API_APP"
CURRENT_HOST=""
if flyctl ssh console -a "$API_APP" -C "printenv REDIS_URL" 2>/dev/null | grep -q "$CANONICAL_HOST"; then
  CURRENT_HOST="$CANONICAL_HOST"
  echo "  ✔ REDIS_URL already points at $CANONICAL_HOST"
else
  LIVE_URL=$(flyctl ssh console -a "$API_APP" -C "printenv REDIS_URL" 2>/dev/null || true)
  CURRENT_HOST=$(echo "$LIVE_URL" | grep -o 'fly-[^.]*\.upstash\.io' || echo "(missing or wrong)")
  echo "  ⚠ REDIS_URL host is: $CURRENT_HOST (expected $CANONICAL_HOST)"
  echo ""
  echo "  Fix — copy Private URL from status below, then:"
  echo "    flyctl secrets set REDIS_URL=\"<private-url>\" --app $API_APP"
  echo ""
  flyctl redis status "$CANONICAL_REDIS"
  echo ""
  read -r -p "Paste Private URL now to update REDIS_URL? [y/N] " set_secret
  if [[ "$set_secret" =~ ^[Yy]$ ]]; then
    read -r -p "Private URL: " REDIS_URL
    if [[ -n "$REDIS_URL" && "$REDIS_URL" == *"$CANONICAL_HOST"* ]]; then
      flyctl secrets set REDIS_URL="$REDIS_URL" --app "$API_APP"
      echo "  ✔ REDIS_URL updated (machines will restart)"
    else
      echo "  ✖ URL empty or host is not $CANONICAL_HOST — skipped"
    fi
  fi
fi
echo ""

echo "▶ Step 2 — Disable Prod Pack on $CANONICAL_REDIS"
echo "  flyctl redis update often fails with 'Could not find AddOn'."
echo "  Use Upstash dashboard instead:"
echo "    https://console.upstash.com → DATABASES → $CANONICAL_REDIS → Settings → disable Prod Pack"
echo ""
read -r -p "Try flyctl redis update anyway? [y/N] " try_update
if [[ "$try_update" =~ ^[Yy]$ ]]; then
  flyctl redis update "$CANONICAL_REDIS" || echo "  (CLI failed — use Upstash dashboard above)"
fi
echo ""

echo "▶ Step 3 — Remove duplicate Redis (if any)"
echo "  Only destroy databases that are NOT $CANONICAL_REDIS and NOT referenced by REDIS_URL."
echo "  If turnos-redis was already deleted, skip this step."
echo ""
read -r -p "List names to destroy (space-separated), or press Enter to skip: " -a TO_DESTROY
for name in "${TO_DESTROY[@]}"; do
  if [[ "$name" == "$CANONICAL_REDIS" ]]; then
    echo "  ✖ Refusing to destroy canonical $CANONICAL_REDIS"
    continue
  fi
  read -r -p "Destroy $name? [y/N] " confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    flyctl redis destroy "$name" -y || echo "  (destroy failed — try Upstash dashboard or Fly support)"
  fi
done
echo ""

echo "▶ Step 4 — Verify"
flyctl redis status "$CANONICAL_REDIS"
echo ""
flyctl ssh console -a "$API_APP" -C "printenv REDIS_URL" 2>/dev/null | grep -o 'fly-[^.]*\.upstash\.io' || echo "  (could not read REDIS_URL)"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 5 — Redeploy API (SOCKET_IO_REDIS_ADAPTER=false):"
echo "    cd apps/api && flyctl deploy --remote-only --app $API_APP"
echo ""
echo "  Step 6 — Health check:"
echo "    curl https://${API_APP}.fly.dev/api/ready"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

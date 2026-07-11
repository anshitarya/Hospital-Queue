#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Fix Upstash Redis cost on Fly.io
#
# Problem: Prod Pack ($200/mo per DB) was enabled on both queue-hq-redis and
# turnos-redis. turnos-api-hq only uses queue-hq-redis.
#
# Usage:
#   ./scripts/fly-redis-fix.sh
#
# Prerequisites: flyctl auth login
# ─────────────────────────────────────────────────────────────────────────────

set -e

KEEP_REDIS="queue-hq-redis"
DROP_REDIS="turnos-redis"
API_APP="turnos-api-hq"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Fly Redis cost fix"
echo "  Keep : $KEEP_REDIS  (used by $API_APP)"
echo "  Drop : $DROP_REDIS  (unused duplicate)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "▶ Current Redis instances:"
flyctl redis list
echo ""

echo "▶ Status of kept instance:"
flyctl redis status "$KEEP_REDIS"
echo ""

echo "▶ Step 1 — Disable Prod Pack on $KEEP_REDIS"
echo "  flyctl will prompt interactively."
echo "  Answer YES to: 'Would you like to disable ProdPack?'"
echo ""
flyctl redis update "$KEEP_REDIS"

echo ""
echo "▶ Step 2 — Destroy unused $DROP_REDIS"
read -r -p "Destroy $DROP_REDIS? This cannot be undone. [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  flyctl redis destroy "$DROP_REDIS" -y
  echo "  ✔ $DROP_REDIS destroyed"
else
  echo "  Skipped destroy. Run manually: flyctl redis destroy $DROP_REDIS -y"
fi

echo ""
echo "▶ Step 3 — Verify API still points at $KEEP_REDIS"
echo "  (Private URL host should be fly-${KEEP_REDIS}.upstash.io)"
flyctl secrets list --app "$API_APP" | grep -i REDIS || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. Redeploy API so SOCKET_IO_REDIS_ADAPTER=false takes effect:"
echo "    cd apps/api && flyctl deploy --remote-only --app $API_APP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

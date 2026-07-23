#!/usr/bin/env bash

# Helper script to start the API backend with artificial network latency (2000ms)
# to easily preview and test skeleton shimmer loaders throughout the app.

echo "========================================================"
echo " Starting Hospital Queue API with 2000ms Throttling... "
echo " Use this mode to test all Skeleton Shimmer Loaders.    "
echo "========================================================"

export DEV_THROTTLE_MS=${1:-2000}
cd "$(dirname "$0")/apps/api" && npm run start:slow

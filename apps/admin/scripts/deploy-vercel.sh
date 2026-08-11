#!/bin/bash
# deploy-vercel.sh — Deploy admin panel to Vercel for a new restaurant.
#
# Usage:
#   ./scripts/deploy-vercel.sh <client-name> <supabase-url> <supabase-anon-key> <venue-id>
#
# Prerequisites:
#   - Vercel CLI installed (npm i -g vercel)
#   - vercel login
#   - Supabase project already set up (see deploy-supabase.sh)
#
# Example:
#   ./scripts/deploy-vercel.sh alto-coffee \
#     https://abcdefghijklmnopqrst.supabase.co \
#     sb_publishable_xxx \
#     00000000-0000-0000-0000-000000000010

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CLIENT="${1:-}"
SUPABASE_URL="${2:-}"
SUPABASE_KEY="${3:-}"
VENUE_ID="${4:-}"

if [ -z "$CLIENT" ] || [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ] || [ -z "$VENUE_ID" ]; then
  echo -e "${RED}Usage: $0 <client-name> <supabase-url> <supabase-anon-key> <venue-id>${NC}"
  echo ""
  echo "  client-name      — short slug, used in the Vercel URL (e.g. 'alto-coffee')"
  echo "  supabase-url     — VITE_SUPABASE_URL"
  echo "  supabase-anon-key — VITE_SUPABASE_ANON_KEY"
  echo "  venue-id         — VITE_VENUE_ID"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Optional org ID (leave empty for personal account)
ORG_ID="${VITE_ORG_ID:-00000000-0000-0000-0000-000000000001}"

echo -e "${YELLOW}=== Building project ===${NC}"
npm run build

echo ""
echo -e "${YELLOW}=== Deploying to Vercel as '$CLIENT' ===${NC}"

vercel deploy \
  --prod \
  --name "$CLIENT" \
  --env VITE_SUPABASE_URL="$SUPABASE_URL" \
  --env VITE_SUPABASE_ANON_KEY="$SUPABASE_KEY" \
  --env VITE_VENUE_ID="$VENUE_ID" \
  --env VITE_ORG_ID="$ORG_ID" \
  --env VITE_REQUIRE_AUTH=false \
  --build-env VITE_SUPABASE_URL="$SUPABASE_URL" \
  --build-env VITE_SUPABASE_ANON_KEY="$SUPABASE_KEY" \
  --build-env VITE_VENUE_ID="$VENUE_ID" \
  --build-env VITE_ORG_ID="$ORG_ID" \
  --build-env VITE_REQUIRE_AUTH=false

echo ""
echo -e "${GREEN}=== Deploy complete! ===${NC}"
echo ""
echo "Your admin panel is live at:"
echo "  https://$CLIENT.vercel.app"
echo ""
echo "To add a custom domain later:"
echo "  vercel domains add admin.your-restaurant.kg"

#!/bin/bash
# new-client.sh — Full onboarding: Supabase + Vercel for one restaurant.
#
# Usage:
#   ./scripts/new-client.sh <client-name> <supabase-project-ref> <venue-uuid>
#
# This is the ONE command you run to spin up a new restaurant.
# It does:
#   1. Push all migrations to the Supabase project
#   2. Deploy the admin panel to Vercel
#   3. Print the URLs and next steps
#
# Prerequisites:
#   - supabase CLI + supabase login
#   - Vercel CLI + vercel login
#
# Example:
#   ./scripts/new-client.sh navat abcdefghijklmnopqrst 00000000-0000-0000-0000-000000000010

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

CLIENT="${1:-}"
PROJECT_REF="${2:-}"
VENUE_ID="${3:-}"

if [ -z "$CLIENT" ] || [ -z "$PROJECT_REF" ] || [ -z "$VENUE_ID" ]; then
  echo "Usage: $0 <client-name> <supabase-project-ref> <venue-uuid>"
  echo ""
  echo "  client-name           — e.g. 'navat', 'alto-coffee'"
  echo "  supabase-project-ref  — from supabase.com/dashboard/project/<ref>"
  echo "  venue-uuid            — UUID of the venue in your database"
  exit 1
fi

SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${BOLD}=== Onboarding: $CLIENT ===${NC}"
echo ""

# Step 1: Supabase
echo -e "${YELLOW}[1/2] Setting up Supabase...${NC}"
"$SCRIPT_DIR/deploy-supabase.sh" "$PROJECT_REF"
echo ""

# Step 2: Get anon key
echo -e "${YELLOW}Enter the Supabase ANON KEY for this project:${NC}"
echo "  (Find it at: https://supabase.com/dashboard/project/$PROJECT_REF/settings/api)"
read -r ANON_KEY

if [ -z "$ANON_KEY" ]; then
  echo "ANON_KEY is required. Aborting."
  exit 1
fi

# Step 3: Vercel
echo ""
echo -e "${YELLOW}[2/2] Deploying admin panel to Vercel...${NC}"
"$SCRIPT_DIR/deploy-vercel.sh" "$CLIENT" "$SUPABASE_URL" "$ANON_KEY" "$VENUE_ID"

echo ""
echo -e "${GREEN}${BOLD}=== Done! $CLIENT is live ===${NC}"
echo ""
echo "Admin panel:  https://${CLIENT}.vercel.app"
echo "Supabase:     https://supabase.com/dashboard/project/${PROJECT_REF}"
echo ""
echo "Next:"
echo "  1. Build the POS app with the same Supabase credentials"
echo "  2. Set EXPO_PUBLIC_SUPABASE_URL=${SUPABASE_URL}"
echo "  3. Set EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}"
echo "  4. Set EXPO_PUBLIC_VENUE_ID=${VENUE_ID}"
echo "  5. Run: cd r_keeper && npx expo start"

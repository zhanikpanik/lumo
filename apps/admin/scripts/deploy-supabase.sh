#!/bin/bash
# deploy-supabase.sh — Link and push all migrations to a Supabase project.
#
# Usage:
#   ./scripts/deploy-supabase.sh <project-ref> [--seed]
#
# Prerequisites:
#   - supabase CLI installed (brew install supabase/tap/supabase)
#   - supabase login (supabase login)
#
# Example:
#   ./scripts/deploy-supabase.sh abcdefghijklmnopqrst
#   ./scripts/deploy-supabase.sh abcdefghijklmnopqrst --seed

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_REF="${1:-}"
SEED_FLAG="${2:-}"

if [ -z "$PROJECT_REF" ]; then
  echo -e "${RED}Usage: $0 <project-ref> [--seed]${NC}"
  echo ""
  echo "  project-ref — Supabase project reference (found in dashboard URL)"
  echo "  --seed      — optionally run seed files after migration"
  echo ""
  echo "Get your project ref from: https://supabase.com/dashboard/project/<ref>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo -e "${YELLOW}=== Linking to Supabase project: $PROJECT_REF ===${NC}"
supabase link --project-ref "$PROJECT_REF"

echo ""
echo -e "${YELLOW}=== Pushing migrations ===${NC}"
supabase db push

echo ""
echo -e "${GREEN}=== Migrations applied successfully ===${NC}"

if [ "$SEED_FLAG" = "--seed" ]; then
  echo ""
  echo -e "${YELLOW}=== Running seed files ===${NC}"
  for seed_file in supabase/seeds/*.sql; do
    if [ -f "$seed_file" ]; then
      echo "  Seeding: $(basename "$seed_file")"
      supabase db execute --file "$seed_file"
    fi
  done
  echo -e "${GREEN}=== Seeds applied ===${NC}"
fi

echo ""
echo -e "${GREEN}=== Done! ===${NC}"
echo ""
echo "Next steps:"
echo "  1. Get your anon key from: https://supabase.com/dashboard/project/$PROJECT_REF/settings/api"
echo "  2. Set VITE_SUPABASE_URL=https://$PROJECT_REF.supabase.co"
echo "  3. Set VITE_SUPABASE_ANON_KEY=<your-anon-key>"
echo "  4. Get your VENUE_ID from the venues table (or use the default dev UUID)"
echo "  5. Run: ./scripts/deploy-vercel.sh"

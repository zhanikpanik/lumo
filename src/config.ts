// Set via EXPO_PUBLIC_VENUE_ID in .env. Falls back to dev default for local development only.
export const VENUE_ID =
  process.env.EXPO_PUBLIC_VENUE_ID || '00000000-0000-0000-0000-000000000010';

// Turn on after applying migration with `pos_refund_order` RPC in the active Supabase project.
export const POS_REFUND_RPC_ENABLED = true;

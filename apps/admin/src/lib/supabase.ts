import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is required. Copy .env.example to .env and fill in your Supabase credentials.');
if (!supabaseKey) throw new Error('VITE_SUPABASE_ANON_KEY is required. Copy .env.example to .env and fill in your Supabase credentials.');

export const supabase = createClient(supabaseUrl, supabaseKey);

export const VENUE_ID = import.meta.env.VITE_VENUE_ID;
if (!VENUE_ID) throw new Error('VITE_VENUE_ID is required. Copy .env.example to .env and set your venue UUID.');

/** Organization id for staff user creation */
export const ORG_ID = import.meta.env.VITE_ORG_ID;
if (!ORG_ID) throw new Error('VITE_ORG_ID is required. Copy .env.example to .env and set your organization UUID.');

export const REQUIRE_AUTH = import.meta.env.VITE_REQUIRE_AUTH === 'true';

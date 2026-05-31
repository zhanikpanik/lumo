import { createClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://gmigxjrvypqjakvualil.supabase.co';
const fallbackKey = 'sb_publishable_bNXLWbJVGS5Dp2FUPywFkQ_9Cg_mPTu';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || fallbackUrl;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || fallbackKey;

export const supabase = createClient(supabaseUrl, supabaseKey);

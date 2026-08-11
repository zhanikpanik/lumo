/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_VENUE_ID: string;
  readonly VITE_ORG_ID: string;
  readonly VITE_FLOOR_PLAN_ZONE_ID: string;
  readonly VITE_LEGACY_ADMIN_ZONE_ID: string;
  readonly VITE_REQUIRE_AUTH: string;
  readonly VITE_INSTANT_ENV: string;
  readonly VITE_INSTANT_APP_ID: string;
  readonly VITE_ACTIVATION_WORKER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

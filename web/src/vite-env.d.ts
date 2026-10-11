/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_AUTH_EMAIL_DOMAIN?: string;
  readonly VITE_SCHEDULE_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

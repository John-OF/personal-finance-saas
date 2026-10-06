export interface Bindings {
  ASSETS: Fetcher
  AUTH_RATE_LIMITER: RateLimit
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  APP_EXTRA_ORIGINS: string
}

export interface AppEnv {
  Bindings: Bindings
}

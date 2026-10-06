import type { Db } from './db/client'

export interface Bindings {
  ASSETS: Fetcher
  AUTH_RATE_LIMITER: RateLimit
  HYPERDRIVE: Hyperdrive
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  APP_EXTRA_ORIGINS: string
}

export interface Variables {
  db: Db
  /** Set by requireAuth from the verified JWT. */
  userId: string
  userEmail: string | null
}

export interface AppEnv {
  Bindings: Bindings
  Variables: Variables
}

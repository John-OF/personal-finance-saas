import type { Context } from 'hono'
import type { Bindings } from '../env'

/** Header the mocked Supabase client reads the session user from (see mockSupabaseSession). */
export const TEST_USER_HEADER = 'X-Test-User'

export function createTestEnv(connectionString: string): Bindings {
  return {
    ASSETS: { fetch: () => Promise.resolve(new Response('asset')) } as unknown as Fetcher,
    AUTH_RATE_LIMITER: { limit: () => Promise.resolve({ success: true }) },
    HYPERDRIVE: { connectionString } as Hyperdrive,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    APP_EXTRA_ORIGINS: '',
  }
}

/** An ExecutionContext whose waitUntil work (closing connections) the test can wait for. */
export function createExecutionContext() {
  const pending: Promise<unknown>[] = []
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    passThroughOnException: () => undefined,
    props: {},
  } as unknown as ExecutionContext
  return { ctx, settle: () => Promise.all(pending) }
}

/**
 * Replacement for lib/supabase in `vi.mock`: the session user is whatever the test header says, so
 * the tests exercise everything after the JWT check without a Supabase project.
 */
export function mockSupabaseSession() {
  return {
    createSupabase: (c: Context) => ({
      auth: {
        getClaims: () => {
          const sub = c.req.header(TEST_USER_HEADER)
          return Promise.resolve(
            sub
              ? { data: { claims: { sub, email: `${sub.slice(-1)}@example.com` } }, error: null }
              : { data: null, error: new Error('no session') },
          )
        },
      },
    }),
  }
}

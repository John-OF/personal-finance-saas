import type { Context } from 'hono'
import type { Bindings } from '../env'

/** Header the mocked session reads the user from (see mockSession). */
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
 * Replacement for lib/session in `vi.mock`: the session user is whatever the test header says, so
 * route tests exercise everything after the token check (covered by lib/session.test.ts).
 */
export function mockSession() {
  return {
    authenticate: (c: Context) => {
      const id = c.req.header(TEST_USER_HEADER)
      return Promise.resolve(id ? { id, email: `${id.slice(-1)}@example.com` } : null)
    },
  }
}

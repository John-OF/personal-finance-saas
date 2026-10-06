import { describe, expect, it } from 'vitest'
import { app } from './app'
import type { Bindings } from './env'

let rateLimitAllows = true

const env: Bindings = {
  ASSETS: { fetch: () => Promise.resolve(new Response('asset')) } as unknown as Fetcher,
  AUTH_RATE_LIMITER: { limit: () => Promise.resolve({ success: rateLimitAllows }) },
  // Nothing listens on port 1: every connection attempt is refused.
  HYPERDRIVE: { connectionString: 'postgresql://user:pass@127.0.0.1:1/db' } as Hyperdrive,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  APP_EXTRA_ORIGINS: 'http://localhost:5173',
}

const ORIGIN = 'http://localhost'

function request(path: string, init: RequestInit = {}) {
  return app.request(path, init, env)
}

function postJson(path: string, body: unknown, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (origin) headers.Origin = origin
  return request(path, { method: 'POST', headers, body: JSON.stringify(body) })
}

describe('GET /api/v1/health', () => {
  it('responds ok with security and no-store headers', async () => {
    const res = await request('/api/v1/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})

describe('GET /api/v1/health/db', () => {
  it('responds 503 when the database is unreachable', async () => {
    const res = await request('/api/v1/health/db')
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: { code: 'database_unavailable' } })
  })
})

describe('same-origin protection', () => {
  it('rejects state-changing requests from a foreign origin', async () => {
    const res = await postJson('/api/v1/auth/login', {}, 'https://evil.example')
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'forbidden_origin' } })
  })

  it('rejects state-changing requests without Origin', async () => {
    const res = await postJson('/api/v1/auth/login', {}, null)
    expect(res.status).toBe(403)
  })

  it('accepts the configured extra origin', async () => {
    const res = await postJson('/api/v1/auth/login', {}, 'http://localhost:5173')
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/auth/login', () => {
  it('validates the body before calling Supabase', async () => {
    const res = await postJson('/api/v1/auth/login', { email: 'not-an-email', extra: true })
    expect(res.status).toBe(400)
    const body = await res.json<{ error: { code: string; fields: Record<string, string[]> } }>()
    expect(body.error.code).toBe('validation_error')
    expect(Object.keys(body.error.fields)).toEqual(expect.arrayContaining(['email', 'password']))
  })

  it('returns 429 when the rate limiter denies the attempt', async () => {
    rateLimitAllows = false
    try {
      const res = await postJson('/api/v1/auth/login', { email: 'a@example.com', password: 'x' })
      expect(res.status).toBe(429)
      expect(await res.json()).toMatchObject({ error: { code: 'rate_limited' } })
    } finally {
      rateLimitAllows = true
    }
  })
})

describe('GET /api/v1/auth/session', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await request('/api/v1/auth/session')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } })
  })
})

describe('unknown routes', () => {
  it('returns a JSON 404 under /api', async () => {
    const res = await request('/api/v1/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } })
  })
})

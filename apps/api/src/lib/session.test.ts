import { stringToBase64URL } from '@supabase/ssr'
import type { Context } from 'hono'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../env'
import { authenticate, checkAccessToken, readAccessToken } from './session'
import { sessionCookieName } from './session-cookie'

const { getClaims } = vi.hoisted(() => ({ getClaims: vi.fn() }))
vi.mock('./supabase', () => ({ createSupabase: () => ({ auth: { getClaims } }) }))

const USER_ID = '00000000-0000-4000-8000-00000000000a'
const SESSION_ID = '00000000-0000-4000-8000-0000000005e5'
const KID = 'test-key'

let keys: CryptoKeyPair
let publicJwk: JsonWebKey
let fetchMock: ReturnType<typeof vi.fn>
let supabaseUrl: string
let urlCounter = 0

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  publicJwk = (await crypto.subtle.exportKey('jwk', keys.publicKey)) as JsonWebKey
})

beforeEach(() => {
  // The key cache lives for the whole module; a new project URL per test starts it empty.
  supabaseUrl = `https://project${++urlCounter}.supabase.co`
  fetchMock = vi.fn(() =>
    Promise.resolve(Response.json({ keys: [{ ...publicJwk, kid: KID, alg: 'ES256' }] })),
  )
  vi.stubGlobal('fetch', fetchMock)
  getClaims.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

function encodeJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)))
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    sub: USER_ID,
    email: 'a@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: `${supabaseUrl}/auth/v1`,
    aud: 'authenticated',
    role: 'authenticated',
    session_id: SESSION_ID,
    ...overrides,
  }
}

async function sign(
  payload: unknown,
  header: Record<string, unknown> = { alg: 'ES256', kid: KID },
) {
  const signingInput = `${encodeJson({ typ: 'JWT', ...header })}.${encodeJson(payload)}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keys.privateKey,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`
}

function sessionCookie(accessToken: string) {
  const value = `base64-${stringToBase64URL(JSON.stringify({ access_token: accessToken, refresh_token: 'r' }))}`
  return `${sessionCookieName(supabaseUrl)}=${value}`
}

function context(cookie?: string) {
  const headers = new Headers(cookie ? { Cookie: cookie } : {})
  return {
    req: { header: (name: string) => headers.get(name) ?? undefined },
    env: { SUPABASE_URL: supabaseUrl },
  } as unknown as Context<AppEnv>
}

describe('checkAccessToken', () => {
  it('accepts a token signed by the project key', async () => {
    const result = await checkAccessToken(await sign(claims()), supabaseUrl)
    expect(result).toMatchObject({ status: 'valid', claims: { sub: USER_ID } })
  })

  it('downloads the keys once and reuses them', async () => {
    await checkAccessToken(await sign(claims()), supabaseUrl)
    await checkAccessToken(await sign(claims()), supabaseUrl)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
  })

  it('rejects a token whose payload was changed after signing', async () => {
    const [header, , signature] = (await sign(claims())).split('.')
    const forged = `${header}.${encodeJson(claims({ sub: '00000000-0000-4000-8000-00000000000b' }))}.${signature}`
    expect(await checkAccessToken(forged, supabaseUrl)).toEqual({ status: 'invalid' })
  })

  it('rejects a token signed by another key', async () => {
    const other = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
    ])) as CryptoKeyPair
    const input = `${encodeJson({ alg: 'ES256', kid: KID })}.${encodeJson(claims())}`
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      other.privateKey,
      new TextEncoder().encode(input),
    )
    const token = `${input}.${base64Url(new Uint8Array(signature))}`
    expect(await checkAccessToken(token, supabaseUrl)).toEqual({ status: 'invalid' })
  })

  it.each([
    ['another issuer', { iss: 'https://evil.supabase.co/auth/v1' }],
    ['another audience', { aud: 'anon' }],
    ['another role', { role: 'service_role' }],
    ['a subject that is not a UUID', { sub: 'admin' }],
    ['no session id', { session_id: undefined }],
  ])('rejects %s', async (_case, overrides) => {
    expect(await checkAccessToken(await sign(claims(overrides)), supabaseUrl)).toEqual({
      status: 'invalid',
    })
  })

  it('asks for a refresh when the token has expired', async () => {
    const expired = await sign(claims({ exp: Math.floor(Date.now() / 1000) - 1 }))
    expect(await checkAccessToken(expired, supabaseUrl)).toEqual({ status: 'refresh' })
  })

  it('leaves other algorithms to supabase-js', async () => {
    const token = await sign(claims(), { alg: 'HS256' })
    expect(await checkAccessToken(token, supabaseUrl)).toEqual({ status: 'refresh' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not download the keys again for every unknown key id', async () => {
    await checkAccessToken(await sign(claims()), supabaseUrl)
    const unknown = await sign(claims(), { alg: 'ES256', kid: 'unknown' })
    expect(await checkAccessToken(unknown, supabaseUrl)).toEqual({ status: 'invalid' })
    expect(await checkAccessToken(unknown, supabaseUrl)).toEqual({ status: 'invalid' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed tokens', async () => {
    expect(await checkAccessToken('not-a-jwt', supabaseUrl)).toEqual({ status: 'invalid' })
    expect(await checkAccessToken('a.b.c', supabaseUrl)).toEqual({ status: 'invalid' })
  })
})

describe('readAccessToken', () => {
  it('reads a base64-encoded session cookie', async () => {
    const name = sessionCookieName(supabaseUrl)
    expect(await readAccessToken(sessionCookie('token-1'), name)).toBe('token-1')
  })

  it('joins a session cookie split in chunks', async () => {
    const name = sessionCookieName(supabaseUrl)
    const value = `base64-${stringToBase64URL(JSON.stringify({ access_token: 'token-2' }))}`
    const half = Math.floor(value.length / 2)
    const header = `${name}.0=${value.slice(0, half)}; other=x; ${name}.1=${value.slice(half)}`
    expect(await readAccessToken(header, name)).toBe('token-2')
  })

  it('returns null without a session cookie or with a corrupt one', async () => {
    const name = sessionCookieName(supabaseUrl)
    expect(await readAccessToken('other=x', name)).toBeNull()
    expect(await readAccessToken(`${name}=base64-not-json`, name)).toBeNull()
  })

  it('uses the project ref in the cookie name', () => {
    expect(sessionCookieName('https://abc123.supabase.co')).toBe('sb-abc123-auth-token')
  })
})

describe('authenticate', () => {
  it('returns the user of a valid session without calling Supabase', async () => {
    const user = await authenticate(context(sessionCookie(await sign(claims()))))
    expect(user).toEqual({ id: USER_ID, email: 'a@example.com', sessionId: SESSION_ID })
    expect(getClaims).not.toHaveBeenCalled()
  })

  it('returns null without a session cookie', async () => {
    expect(await authenticate(context())).toBeNull()
    expect(getClaims).not.toHaveBeenCalled()
  })

  it('returns null for an invalid token without calling Supabase', async () => {
    const forged = await sign(claims({ iss: 'https://evil.example/auth/v1' }))
    expect(await authenticate(context(sessionCookie(forged)))).toBeNull()
    expect(getClaims).not.toHaveBeenCalled()
  })

  it('lets supabase-js refresh an expired session', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, email: 'a@example.com', session_id: SESSION_ID } },
      error: null,
    })
    const expired = await sign(claims({ exp: Math.floor(Date.now() / 1000) - 1 }))
    expect(await authenticate(context(sessionCookie(expired)))).toEqual({
      id: USER_ID,
      email: 'a@example.com',
      sessionId: SESSION_ID,
    })
    expect(getClaims).toHaveBeenCalledTimes(1)
  })

  it('returns null when the refresh fails', async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error('refresh_token_not_found') })
    const expired = await sign(claims({ exp: Math.floor(Date.now() / 1000) - 1 }))
    expect(await authenticate(context(sessionCookie(expired)))).toBeNull()
  })
})

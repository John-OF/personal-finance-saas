import { combineChunks, parseCookieHeader, stringFromBase64URL } from '@supabase/ssr'
import type { Context } from 'hono'
import type { AppEnv } from '../env'
import { isUuid } from './ids'
import { sessionCookieName } from './session-cookie'
import { createSupabase } from './supabase'

// Verifying the session through supabase-js builds a whole client per request and costs 4–22 ms of
// CPU (plan §7.8, measured 2026-10-06), over the 10 ms of the Workers free plan. The access token is
// an ES256 JWT, so it is checked here with WebCrypto and the project's public keys (cached for the
// life of the isolate). supabase-js only steps in when the token has to be refreshed.

export interface AuthenticatedUser {
  id: string
  email: string | null
  /** Supabase session the token belongs to; withUserDb checks it has not been ended. */
  sessionId: string
}

interface AccessTokenClaims {
  sub: string
  email?: string
  exp: number
  iss: string
  aud: string | string[]
  role: string
  session_id: string
}

export type TokenCheck =
  | { status: 'valid'; claims: AccessTokenClaims }
  /** Expired, or signed with an algorithm not verified here: supabase-js must handle it. */
  | { status: 'refresh' }
  | { status: 'invalid' }

const BASE64_PREFIX = 'base64-'
const JWKS_TTL_MS = 10 * 60 * 1000
/** Unknown `kid`s trigger at most one key download per minute (key rotation, not attacker-driven). */
const JWKS_MISS_COOLDOWN_MS = 60 * 1000

interface KeyCache {
  fetchedAt: number
  keys: Map<string, CryptoKey>
}
const keyCaches = new Map<string, KeyCache>()

/** The access token in the (possibly chunked, possibly base64-encoded) session cookie. */
export async function readAccessToken(cookieHeader: string, cookieName: string) {
  const cookies = new Map(parseCookieHeader(cookieHeader).map(({ name, value }) => [name, value]))
  const raw = await combineChunks(cookieName, (name) => cookies.get(name))
  if (!raw) return null
  try {
    const json = raw.startsWith(BASE64_PREFIX)
      ? stringFromBase64URL(raw.slice(BASE64_PREFIX.length))
      : raw
    const session = JSON.parse(json) as { access_token?: unknown }
    return typeof session.access_token === 'string' ? session.access_token : null
  } catch {
    return null
  }
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function decodeJson(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)))
}

async function downloadKeys(supabaseUrl: string): Promise<KeyCache> {
  const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
  if (!res.ok) throw new Error(`jwks_fetch_failed: ${res.status}`)
  const { keys } = await res.json<{ keys?: (JsonWebKey & { kid?: string })[] }>()
  const imported = new Map<string, CryptoKey>()
  for (const jwk of keys ?? []) {
    if (!jwk.kid || jwk.kty !== 'EC' || jwk.crv !== 'P-256') continue
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    imported.set(jwk.kid, key)
  }
  return { fetchedAt: Date.now(), keys: imported }
}

async function signingKey(supabaseUrl: string, kid: string) {
  let cache = keyCaches.get(supabaseUrl)
  const age = cache ? Date.now() - cache.fetchedAt : Infinity
  const stale = age > JWKS_TTL_MS
  const missing = !cache?.keys.has(kid) && age > JWKS_MISS_COOLDOWN_MS
  if (!cache || stale || missing) {
    cache = await downloadKeys(supabaseUrl)
    keyCaches.set(supabaseUrl, cache)
  }
  return cache.keys.get(kid) ?? null
}

/** Checks signature, issuer, audience, role, subject, session and expiry of a Supabase access token. */
export async function checkAccessToken(token: string, supabaseUrl: string): Promise<TokenCheck> {
  const parts = token.split('.')
  const [rawHeader, rawPayload, rawSignature] = parts
  if (parts.length !== 3 || !rawHeader || !rawPayload || !rawSignature) return { status: 'invalid' }

  let header: { alg?: unknown; kid?: unknown }
  let claims: AccessTokenClaims
  try {
    header = decodeJson(rawHeader) as typeof header
    claims = decodeJson(rawPayload) as AccessTokenClaims
  } catch {
    return { status: 'invalid' }
  }
  if (header.alg !== 'ES256' || typeof header.kid !== 'string') return { status: 'refresh' }

  const key = await signingKey(supabaseUrl, header.kid)
  if (!key) return { status: 'invalid' }
  const signed = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    base64UrlToBytes(rawSignature),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  )
  if (!signed) return { status: 'invalid' }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  const trusted =
    claims.iss === `${supabaseUrl}/auth/v1` &&
    audiences.includes('authenticated') &&
    claims.role === 'authenticated' &&
    isUuid(claims.sub) &&
    isUuid(claims.session_id) &&
    typeof claims.exp === 'number'
  if (!trusted) return { status: 'invalid' }
  if (claims.exp <= Math.floor(Date.now() / 1000)) return { status: 'refresh' }
  return { status: 'valid', claims }
}

/** The user of the request's session, or null. Refreshes an expired session through supabase-js. */
export async function authenticate(c: Context<AppEnv>): Promise<AuthenticatedUser | null> {
  const cookieHeader = c.req.header('Cookie') ?? ''
  const token = await readAccessToken(cookieHeader, sessionCookieName(c.env.SUPABASE_URL))
  if (!token) return null

  const check = await checkAccessToken(token, c.env.SUPABASE_URL)
  if (check.status === 'valid') {
    const { sub, email, session_id } = check.claims
    return { id: sub, email: email ?? null, sessionId: session_id }
  }
  if (check.status === 'invalid') return null

  // Slow path, about once an hour per user: refreshes the session and rewrites the cookies.
  const { data, error } = await createSupabase(c).auth.getClaims()
  if (error || !data || !isUuid(data.claims.sub) || !isUuid(data.claims.session_id)) return null
  return {
    id: data.claims.sub,
    email: data.claims.email ?? null,
    sessionId: data.claims.session_id,
  }
}

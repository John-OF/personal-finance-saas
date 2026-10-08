import { parseCookieHeader } from '@supabase/ssr'
import type { Context } from 'hono'
import { deleteCookie } from 'hono/cookie'
import type { AppEnv } from '../env'

/** Name of the session cookie supabase-js uses for this project. */
export function sessionCookieName(supabaseUrl: string) {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
}

/**
 * Makes the browser drop the session cookie, chunks included, with the attributes createSupabase
 * sets. For sessions that ended elsewhere: the browser would keep sending a token that no longer
 * opens anything until it expires.
 */
export function clearSessionCookies(c: Context<AppEnv>) {
  const name = sessionCookieName(c.env.SUPABASE_URL)
  for (const cookie of parseCookieHeader(c.req.header('Cookie') ?? '')) {
    if (cookie.name === name || cookie.name.startsWith(`${name}.`)) {
      deleteCookie(c, cookie.name, { path: '/', secure: true, httpOnly: true, sameSite: 'Lax' })
    }
  }
}

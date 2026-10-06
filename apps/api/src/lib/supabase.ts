import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import type { Context } from 'hono'
import { setCookie } from 'hono/cookie'
import type { AppEnv } from '../env'

/**
 * Supabase client bound to the request cookies. The session never reaches JavaScript in the
 * browser: cookies are always httpOnly, Secure and SameSite=Lax.
 */
export function createSupabase(c: Context<AppEnv>) {
  return createServerClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(c.req.header('Cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        }))
      },
      setAll(cookies, headers) {
        for (const { name, value, options } of cookies) {
          setCookie(c, name, value, {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
            ...(options.maxAge !== undefined && { maxAge: options.maxAge }),
            ...(options.expires !== undefined && { expires: options.expires }),
          })
        }
        for (const [key, value] of Object.entries(headers)) c.header(key, value)
      },
    },
  })
}

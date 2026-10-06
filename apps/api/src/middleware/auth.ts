import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'
import { apiError } from '../lib/errors'
import { isUuid } from '../lib/ids'
import { createSupabase } from '../lib/supabase'

/**
 * Requires a valid session and exposes its user in `c.var.userId` / `c.var.userEmail`. The JWT is
 * verified (locally when the project uses asymmetric signing keys) and refreshed when it has
 * expired, rewriting the cookies. The user id never comes from the request body.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const { data, error } = await createSupabase(c).auth.getClaims()
  if (error || !data || !isUuid(data.claims.sub)) {
    return apiError(c, 401, 'unauthenticated', 'Inicia sesión.')
  }

  c.set('userId', data.claims.sub)
  c.set('userEmail', data.claims.email ?? null)
  return next()
})

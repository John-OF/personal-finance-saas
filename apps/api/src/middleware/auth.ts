import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'
import { apiError } from '../lib/errors'
import { authenticate } from '../lib/session'

/**
 * Requires a valid session and exposes its user in `c.var.userId` / `c.var.userEmail`. The user id
 * comes only from the verified access token, never from the request body.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await authenticate(c)
  if (!user) return apiError(c, 401, 'unauthenticated', 'Inicia sesión.')

  c.set('userId', user.id)
  c.set('userEmail', user.email)
  return next()
})

import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'
import { apiError } from '../lib/errors'
import { authenticate } from '../lib/session'

/**
 * Requires a valid session and exposes its user in `c.var.userId` / `c.var.userEmail` /
 * `c.var.sessionId`. They come only from the verified access token, never from the request body.
 * Whether the session has since been ended is checked by withUserDb.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await authenticate(c)
  if (!user) return apiError(c, 401, 'unauthenticated', 'Inicia sesión.')

  c.set('userId', user.id)
  c.set('userEmail', user.email)
  c.set('sessionId', user.sessionId)
  return next()
})

/**
 * Lets only admins through. Goes after withUserDb, which loads the role from user_access (never from
 * anything the user can edit). The database functions behind admin routes check it again.
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.userRole !== 'admin') {
    return apiError(c, 403, 'forbidden', 'No tienes acceso a esta sección.')
  }
  return next()
})

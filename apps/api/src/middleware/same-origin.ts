import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'
import { apiError } from '../lib/errors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF protection: any request that can change data must come from our own origin (or an
 * explicitly allowed one, such as the Vite dev server). Browsers always send Origin on these
 * requests; a missing Origin is rejected too.
 */
export const requireSameOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next()

  const origin = c.req.header('Origin')
  const allowed = new Set([
    new URL(c.req.url).origin,
    ...c.env.APP_EXTRA_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  ])
  if (!origin || !allowed.has(origin)) {
    return apiError(c, 403, 'forbidden_origin', 'Origen no permitido.')
  }
  return next()
})

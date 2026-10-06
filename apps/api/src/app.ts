import type { HealthResponse } from '@pf/shared'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import type { AppEnv } from './env'
import { apiError } from './lib/errors'
import { withDb } from './middleware/db'
import { requireSameOrigin } from './middleware/same-origin'
import { authRoutes } from './routes/auth'

export const app = new Hono<AppEnv>()

// Same HSTS as the static assets (apps/web/public/_headers).
app.use('/api/*', secureHeaders({ strictTransportSecurity: 'max-age=31536000; includeSubDomains' }))
app.use('/api/*', async (c, next) => {
  await next()
  // Financial data must never be stored by browsers or intermediate caches.
  c.header('Cache-Control', 'no-store')
})
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) => apiError(c, 413, 'payload_too_large', 'La petición es demasiado grande.'),
  }),
)
app.use('/api/*', requireSameOrigin)

app.get('/api/v1/health', (c) => {
  const body: HealthResponse = { status: 'ok', time: new Date().toISOString() }
  return c.json(body)
})
// Separate from /health so uptime checks do not spend the daily Hyperdrive query quota.
app.get('/api/v1/health/db', withDb, async (c) => {
  await c.var.db.execute(sql`select 1`)
  const body: HealthResponse = { status: 'ok', time: new Date().toISOString() }
  return c.json(body)
})
app.route('/api/v1/auth', authRoutes)

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return apiError(c, 404, 'not_found', 'Recurso no encontrado.')
  return c.env.ASSETS.fetch(c.req.raw)
})

app.onError((err, c) => {
  console.error('unhandled_error', { path: c.req.path, name: err.name, message: err.message })
  return apiError(c, 500, 'internal_error', 'Ocurrió un error inesperado.')
})

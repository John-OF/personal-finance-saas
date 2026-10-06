import { createMiddleware } from 'hono/factory'
import { openDb } from '../db/client'
import type { AppEnv } from '../env'
import { apiError } from '../lib/errors'

/** Gives the route a database connection in `c.var.db` and closes it after the response. */
export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  let connection: Awaited<ReturnType<typeof openDb>>
  try {
    connection = await openDb(c.env.HYPERDRIVE.connectionString)
  } catch (err) {
    console.error('db_connect_failed', {
      name: (err as Error).name,
      message: (err as Error).message,
    })
    return apiError(
      c,
      503,
      'database_unavailable',
      'El servicio no está disponible. Inténtalo de nuevo.',
    )
  }

  c.set('db', connection.db)
  try {
    await next()
  } finally {
    c.executionCtx.waitUntil(connection.close())
  }
})

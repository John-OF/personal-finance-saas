import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { openDb, type DbConnection } from '../db/client'
import type { AppEnv } from '../env'
import { apiError } from '../lib/errors'
import { isUuid } from '../lib/ids'

async function connect(c: Context<AppEnv>): Promise<DbConnection | Response> {
  try {
    return await openDb(c.env.HYPERDRIVE.connectionString)
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
}

/**
 * Gives the route a database connection in `c.var.db` and closes it after the response. Without a
 * user set, row-level security hides every user's rows: use withUserDb for user data.
 */
export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  const connection = await connect(c)
  if (connection instanceof Response) return connection

  c.set('db', connection.db)
  try {
    await next()
  } finally {
    c.executionCtx.waitUntil(connection.close())
  }
})

/**
 * Like withDb, but the whole request runs in one transaction with `app.user_id` set to the session
 * user, which is what the row-level security policies filter by. The setting is local to the
 * transaction, so it cannot leak to another request through Hyperdrive's pool. Commits when the
 * handler succeeds and rolls back when it throws. Goes after requireAuth.
 */
export const withUserDb = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.var.userId
  // Inlined rather than bound so BEGIN and set_config travel in a single round trip (the simple
  // query protocol takes no parameters). Safe because only a UUID can get here.
  if (!isUuid(userId)) throw new Error('withUserDb needs requireAuth before it')

  const connection = await connect(c)
  if (connection instanceof Response) return connection

  try {
    await connection.client.query(`begin; select set_config('app.user_id', '${userId}', true)`)
    c.set('db', connection.db)
    await next()
    // A failed COMMIT throws, so the client gets an error instead of a success that was not saved.
    await connection.client.query(c.error ? 'rollback' : 'commit')
  } finally {
    c.executionCtx.waitUntil(connection.close())
  }
})

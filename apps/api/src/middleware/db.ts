import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { QueryResult } from 'pg'
import { openDb, type DbConnection } from '../db/client'
import type { UserRole } from '../db/schema'
import type { AppEnv } from '../env'
import { apiError } from '../lib/errors'
import { isUuid } from '../lib/ids'
import { clearSessionCookies } from '../lib/session-cookie'

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
 * transaction, so it cannot leak to another request through Hyperdrive's pool. Also turns away,
 * even while their access token is still valid, sessions that were ended (401, see migration 0004)
 * and suspended accounts (403), and loads the user's role into `c.var.userRole`. Commits when the
 * handler succeeds and rolls back when it throws. Goes after requireAuth.
 */
export const withUserDb = createMiddleware<AppEnv>(async (c, next) => {
  const { userId, sessionId } = c.var
  // Inlined rather than bound so the statements travel in a single round trip (the simple query
  // protocol takes no parameters). Safe because only UUIDs can get here.
  if (!isUuid(userId) || !isUuid(sessionId)) {
    throw new Error('withUserDb needs requireAuth before it')
  }

  const connection = await connect(c)
  if (connection instanceof Response) return connection

  try {
    const results = (await connection.client.query(
      `begin; select set_config('app.user_id', '${userId}', true); ` +
        `select session_is_active('${sessionId}') as active; ` +
        `select role, status from user_access where user_id = '${userId}'`,
    )) as unknown as QueryResult[]
    const [, , session, accessRows] = results
    const active = (session?.rows[0] as { active: boolean } | undefined)?.active
    if (active !== true) {
      await connection.client.query('rollback')
      clearSessionCookies(c)
      return apiError(c, 401, 'session_ended', 'Tu sesión se cerró. Vuelve a iniciar sesión.')
    }
    // No row means a regular, active user.
    const access = accessRows?.rows[0] as { role: UserRole; status: string } | undefined
    if (access?.status === 'suspended') {
      await connection.client.query('rollback')
      return apiError(c, 403, 'account_suspended', 'Tu cuenta está suspendida.')
    }

    c.set('userRole', access?.role ?? 'user')
    c.set('db', connection.db)
    await next()
    // A failed COMMIT throws, so the client gets an error instead of a success that was not saved.
    await connection.client.query(c.error ? 'rollback' : 'commit')
  } finally {
    c.executionCtx.waitUntil(connection.close())
  }
})

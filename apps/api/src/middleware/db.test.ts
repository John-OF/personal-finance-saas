import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { profiles } from '../db/schema'
import type { AppEnv } from '../env'
import { createExecutionContext, createTestEnv, TEST_USER_HEADER } from '../test/app'
import { startApiDatabase } from '../test/db'
import { withUserDb } from './db'

const USER_A = '00000000-0000-4000-8000-00000000000a'
const ADMIN = '00000000-0000-4000-8000-0000000000ad'
const SUSPENDED = '00000000-0000-4000-8000-00000000005d'

// Stands in for requireAuth: the user comes from a header.
const testApp = new Hono<AppEnv>()
  .use(async (c, next) => {
    c.set('userId', c.req.header(TEST_USER_HEADER) ?? '')
    await next()
  })
  .use(withUserDb)
  .post('/create-then-fail', async (c) => {
    await c.var.db.insert(profiles).values({ id: c.var.userId })
    throw new Error('boom')
  })
  .post('/create', async (c) => {
    await c.var.db.insert(profiles).values({ id: c.var.userId })
    return c.body(null, 204)
  })
  .post('/role', (c) => c.json({ role: c.var.userRole }))
testApp.onError((_err, c) => c.json({ error: 'failed' }, 500))

let database: Awaited<ReturnType<typeof startApiDatabase>>

beforeAll(async () => {
  database = await startApiDatabase()
  await database.asAdmin((db) =>
    db.exec(`
      insert into auth.users (id) values ('${USER_A}'), ('${ADMIN}'), ('${SUSPENDED}');
      insert into user_access (user_id, role, status)
        values ('${ADMIN}', 'admin', 'active'), ('${SUSPENDED}', 'user', 'suspended');
    `),
  )
})

afterAll(async () => {
  await database.stop()
})

async function post(path: string, userId: string, connectionString = database.connectionString) {
  const { ctx, settle } = createExecutionContext()
  const res = await testApp.request(
    path,
    { method: 'POST', headers: { [TEST_USER_HEADER]: userId } },
    createTestEnv(connectionString),
    ctx,
  )
  await settle()
  return res
}

async function profileExists(userId = USER_A) {
  return database.asAdmin(async (db) => {
    const { rows } = await db.query('select 1 from profiles where id = $1', [userId])
    return rows.length === 1
  })
}

describe('withUserDb', () => {
  it('rolls back everything the handler wrote when it fails', async () => {
    const res = await post('/create-then-fail', USER_A)
    expect(res.status).toBe(500)
    expect(await profileExists()).toBe(false)
  })

  it('commits when the handler succeeds', async () => {
    const res = await post('/create', USER_A)
    expect(res.status).toBe(204)
    expect(await profileExists()).toBe(true)
  })

  it('refuses to run without a valid user id', async () => {
    const res = await post('/create', "x'); drop table profiles; --")
    expect(res.status).toBe(500)
    expect(await profileExists()).toBe(true)
  })

  it('exposes the role from user_access, defaulting to user', async () => {
    expect(await (await post('/role', ADMIN)).json()).toEqual({ role: 'admin' })
    expect(await (await post('/role', USER_A)).json()).toEqual({ role: 'user' })
  })

  it('turns a suspended account away before the handler runs', async () => {
    const res = await post('/create', SUSPENDED)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'account_suspended' } })
    expect(await profileExists(SUSPENDED)).toBe(false)
  })

  it('responds 503 when the database is unreachable', async () => {
    const res = await post('/create', USER_A, 'postgresql://user:pass@127.0.0.1:1/db')
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: { code: 'database_unavailable' } })
  })
})

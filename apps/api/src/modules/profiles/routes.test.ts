import type { MeResponse } from '@pf/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../../app'
import { createExecutionContext, createTestEnv, TEST_USER_HEADER } from '../../test/app'
import { startApiDatabase } from '../../test/db'

vi.mock('../../lib/supabase', async () => (await import('../../test/app')).mockSupabaseSession())

const USER_A = '00000000-0000-4000-8000-00000000000a'
const USER_B = '00000000-0000-4000-8000-00000000000b'

let database: Awaited<ReturnType<typeof startApiDatabase>>

beforeAll(async () => {
  database = await startApiDatabase()
  await database.asAdmin((db) =>
    db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}')`),
  )
})

afterAll(async () => {
  await database.stop()
})

async function getMe(userId?: string) {
  const { ctx, settle } = createExecutionContext()
  const headers: Record<string, string> = userId ? { [TEST_USER_HEADER]: userId } : {}
  const res = await app.request(
    '/api/v1/me',
    { headers },
    createTestEnv(database.connectionString),
    ctx,
  )
  await settle()
  return res
}

async function countProfiles() {
  return database.asAdmin(async (db) => {
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from profiles')
    return rows[0]?.n
  })
}

describe('GET /api/v1/me', () => {
  it('returns 401 without a session', async () => {
    const res = await getMe()
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'unauthenticated' } })
  })

  it('creates the profile with the defaults on first use, and only once', async () => {
    const first = await getMe(USER_A)
    expect(first.status).toBe(200)
    const body = await first.json<MeResponse>()
    expect(body).toEqual({
      user: { id: USER_A, email: 'a@example.com' },
      profile: {
        displayName: null,
        currency: 'USD',
        locale: 'es-EC',
        timezone: 'America/Guayaquil',
        weekStartsOn: 1,
        onboardedAt: null,
      },
    })

    const second = await getMe(USER_A)
    expect(await second.json()).toEqual(body)
    expect(await countProfiles()).toBe(1)
  })

  it("gives each user their own profile and never another user's", async () => {
    const res = await getMe(USER_B)
    expect((await res.json<MeResponse>()).user.id).toBe(USER_B)
    expect(await countProfiles()).toBe(2)
  })

  it('leaves no user set on the connection after the request', async () => {
    await getMe(USER_A)
    // Same PGlite session the API used, as the API role: without app.user_id nothing is visible.
    const { rows } = await database.db.query('select id from profiles')
    expect(rows).toEqual([])
  })
})

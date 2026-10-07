import { MODULE_IDS, type MeResponse } from '@pf/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../../app'
import { createExecutionContext, createTestEnv, TEST_USER_HEADER } from '../../test/app'
import { startApiDatabase } from '../../test/db'

vi.mock('../../lib/session', async () => (await import('../../test/app')).mockSession())

const USER_A = '00000000-0000-4000-8000-00000000000a'
const USER_B = '00000000-0000-4000-8000-00000000000b'
const USER_C = '00000000-0000-4000-8000-00000000000c'

let database: Awaited<ReturnType<typeof startApiDatabase>>

beforeAll(async () => {
  database = await startApiDatabase()
  await database.asAdmin((db) =>
    db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}'), ('${USER_C}')`),
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

async function patchProfile(userId: string, body: unknown) {
  const { ctx, settle } = createExecutionContext()
  const res = await app.request(
    '/api/v1/me/profile',
    {
      method: 'PATCH',
      headers: {
        [TEST_USER_HEADER]: userId,
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    },
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
      role: 'user',
      profile: {
        displayName: null,
        currency: 'USD',
        locale: 'es-EC',
        timezone: 'America/Guayaquil',
        weekStartsOn: 1,
        onboardedAt: null,
        enabledModules: [...MODULE_IDS],
        theme: null,
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

  it('reports the admin role from user_access', async () => {
    await database.asAdmin((db) =>
      db.exec(`insert into user_access (user_id, role) values ('${USER_B}', 'admin')`),
    )
    expect((await (await getMe(USER_B)).json<MeResponse>()).role).toBe('admin')
  })

  it('leaves no user set on the connection after the request', async () => {
    await getMe(USER_A)
    // Same PGlite session the API used, as the API role: without app.user_id nothing is visible.
    const { rows } = await database.db.query('select id from profiles')
    expect(rows).toEqual([])
  })
})

describe('PATCH /api/v1/me/profile', () => {
  it('updates only the fields sent', async () => {
    const res = await patchProfile(USER_C, {
      displayName: '  Ana  ',
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      theme: { theme: 'malva', mode: 'dark' },
    })
    expect(res.status).toBe(200)
    const { profile } = await res.json<MeResponse>()
    expect(profile).toMatchObject({
      displayName: 'Ana',
      currency: 'EUR',
      timezone: 'Europe/Madrid',
      weekStartsOn: 1,
      enabledModules: [...MODULE_IDS],
      theme: { theme: 'malva', mode: 'dark' },
      onboardedAt: null,
    })
  })

  it('clears the display name with null', async () => {
    const res = await patchProfile(USER_C, { displayName: null })
    expect((await res.json<MeResponse>()).profile.displayName).toBeNull()
  })

  it('keeps the first date when the setup wizard is finished twice', async () => {
    const first = await patchProfile(USER_C, {
      enabledModules: ['commission'],
      completeOnboarding: true,
    })
    const { profile } = await first.json<MeResponse>()
    expect(profile.enabledModules).toEqual(['commission'])
    expect(profile.onboardedAt).not.toBeNull()

    const again = await patchProfile(USER_C, { completeOnboarding: true })
    expect((await again.json<MeResponse>()).profile.onboardedAt).toBe(profile.onboardedAt)
  })

  it.each([
    ['an unknown currency', { currency: 'XYZ' }, 'currency', 'Elige una moneda de la lista.'],
    [
      'an unknown time zone',
      { timezone: 'Mars/Olympus' },
      'timezone',
      'Elige una zona horaria de la lista.',
    ],
    ['no modules', { enabledModules: [] }, 'enabledModules', 'Activa al menos un módulo.'],
    [
      'repeated modules',
      { enabledModules: ['debts', 'debts'] },
      'enabledModules',
      'Hay módulos repetidos.',
    ],
  ])('rejects %s with a message for the form', async (_case, body, field, message) => {
    const res = await patchProfile(USER_C, body)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { fields: { [field]: [message] } } })
  })

  it.each([
    ['an unknown module', { enabledModules: ['casino'] }],
    ['an unknown theme', { theme: { theme: 'rosa', mode: 'light' } }],
    ['fields that cannot be edited', { onboardedAt: '2020-01-01T00:00:00Z' }],
    ['an empty update', {}],
  ])('rejects %s', async (_case, body) => {
    const res = await patchProfile(USER_C, body)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'validation_error' } })
  })

  it("never touches another user's profile", async () => {
    await patchProfile(USER_A, { displayName: 'Solo A' })
    const b = await getMe(USER_B)
    expect((await b.json<MeResponse>()).profile.displayName).toBeNull()
  })
})

import type { AdminUserListResponse } from '@pf/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../../app'
import { createExecutionContext, createTestEnv, TEST_USER_HEADER } from '../../test/app'
import { startApiDatabase } from '../../test/db'

vi.mock('../../lib/session', async () => (await import('../../test/app')).mockSession())

const ADMIN = '00000000-0000-4000-8000-0000000000ad'
const USER_A = '00000000-0000-4000-8000-00000000000a'
const USER_B = '00000000-0000-4000-8000-00000000000b'
const NEW_USER = '00000000-0000-4000-8000-00000000000c'
const DELETED = '00000000-0000-4000-8000-00000000000d'

let database: Awaited<ReturnType<typeof startApiDatabase>>

beforeAll(async () => {
  database = await startApiDatabase()
  await database.asAdmin((db) =>
    db.exec(`
      insert into auth.users (id, email, created_at, email_confirmed_at, last_sign_in_at, deleted_at)
      values
        ('${ADMIN}', 'jefa@example.com', '2026-10-01T10:00:00Z', '2026-10-01T10:05:00Z',
          '2026-10-07T08:00:00Z', null),
        ('${USER_A}', 'ana@example.com', '2026-10-02T10:00:00Z', '2026-10-02T10:05:00Z',
          '2026-10-06T09:30:00Z', null),
        ('${USER_B}', 'b_o@example.com', '2026-10-03T10:00:00Z', '2026-10-03T10:05:00Z',
          '2026-10-03T10:06:00Z', null),
        ('${NEW_USER}', 'nuevo@example.com', '2026-10-04T10:00:00Z', null, null, null),
        ('${DELETED}', 'borrado@example.com', '2026-10-05T10:00:00Z', null, null,
          '2026-10-06T00:00:00Z');
      insert into user_access (user_id, role, status)
        values ('${ADMIN}', 'admin', 'active'), ('${USER_B}', 'user', 'suspended');
      insert into profiles (id, display_name, onboarded_at, enabled_modules)
      values
        ('${ADMIN}', 'Laura', '2026-10-01T10:10:00Z', '{finances,commission}'),
        ('${USER_A}', 'Ana Pérez', '2026-10-02T10:10:00Z', '{commission}'),
        ('${USER_B}', null, null, '{finances}');
      insert into auth.users (id, email, created_at)
        select gen_random_uuid(), 'bulk' || n || '@example.com', '2020-01-01'::timestamptz + n * interval '1 minute'
        from generate_series(1, 55) n;
    `),
  )
})

afterAll(async () => {
  await database.stop()
})

async function listUsers(userId: string | undefined, query = '') {
  const { ctx, settle } = createExecutionContext()
  const headers: Record<string, string> = userId ? { [TEST_USER_HEADER]: userId } : {}
  const res = await app.request(
    `/api/v1/admin/users${query}`,
    { headers },
    createTestEnv(database.connectionString),
    ctx,
  )
  await settle()
  return res
}

async function emails(query: string) {
  const res = await listUsers(ADMIN, query)
  expect(res.status).toBe(200)
  return (await res.json<AdminUserListResponse>()).users.map(({ email }) => email)
}

describe('GET /api/v1/admin/users', () => {
  it('returns 401 without a session', async () => {
    expect((await listUsers(undefined)).status).toBe(401)
  })

  it('returns 403 to a user who is not an admin', async () => {
    const res = await listUsers(USER_A)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'forbidden' } })
  })

  it('lists the newest users first with their account metadata, without deleted ones', async () => {
    const res = await listUsers(ADMIN)
    expect(res.status).toBe(200)
    const { users, total } = await res.json<AdminUserListResponse>()
    expect(total).toBe(59)
    expect(users).toHaveLength(50)
    expect(users.slice(0, 4)).toEqual([
      {
        id: NEW_USER,
        email: 'nuevo@example.com',
        role: 'user',
        status: 'active',
        createdAt: '2026-10-04T10:00:00.000Z',
        emailConfirmedAt: null,
        lastSignInAt: null,
        profile: null,
      },
      {
        id: USER_B,
        email: 'b_o@example.com',
        role: 'user',
        status: 'suspended',
        createdAt: '2026-10-03T10:00:00.000Z',
        emailConfirmedAt: '2026-10-03T10:05:00.000Z',
        lastSignInAt: '2026-10-03T10:06:00.000Z',
        profile: { displayName: null, onboardedAt: null, enabledModules: ['finances'] },
      },
      {
        id: USER_A,
        email: 'ana@example.com',
        role: 'user',
        status: 'active',
        createdAt: '2026-10-02T10:00:00.000Z',
        emailConfirmedAt: '2026-10-02T10:05:00.000Z',
        lastSignInAt: '2026-10-06T09:30:00.000Z',
        profile: {
          displayName: 'Ana Pérez',
          onboardedAt: '2026-10-02T10:10:00.000Z',
          enabledModules: ['commission'],
        },
      },
      {
        id: ADMIN,
        email: 'jefa@example.com',
        role: 'admin',
        status: 'active',
        createdAt: '2026-10-01T10:00:00.000Z',
        emailConfirmedAt: '2026-10-01T10:05:00.000Z',
        lastSignInAt: '2026-10-07T08:00:00.000Z',
        profile: {
          displayName: 'Laura',
          onboardedAt: '2026-10-01T10:10:00.000Z',
          enabledModules: ['finances', 'commission'],
        },
      },
    ])
    expect(users.map(({ email }) => email)).not.toContain('borrado@example.com')
  })

  it('pages through the results', async () => {
    const res = await listUsers(ADMIN, '?q=bulk&offset=50')
    const { users, total } = await res.json<AdminUserListResponse>()
    expect(total).toBe(55)
    expect(users.map(({ email }) => email)).toEqual([
      'bulk5@example.com',
      'bulk4@example.com',
      'bulk3@example.com',
      'bulk2@example.com',
      'bulk1@example.com',
    ])
    expect(await listUsers(ADMIN, '?q=bulk&offset=100').then((r) => r.json())).toEqual({
      users: [],
      total: 0,
    })
  })

  it('searches by email or name, ignoring case and surrounding spaces', async () => {
    expect(await emails('?q=JEFA')).toEqual(['jefa@example.com'])
    expect(await emails(`?q=${encodeURIComponent('  pérez ')}`)).toEqual(['ana@example.com'])
  })

  it('takes % and _ in the search literally', async () => {
    expect(await emails('?q=_')).toEqual(['b_o@example.com'])
    expect(await emails('?q=%25')).toEqual([])
  })

  it.each([
    ['an unknown parameter', '?role=admin'],
    ['a negative offset', '?offset=-1'],
    ['an offset that is not a number', '?offset=abc'],
    ['a search that is too long', `?q=${'a'.repeat(101)}`],
  ])('rejects %s', async (_case, query) => {
    const res = await listUsers(ADMIN, query)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'validation_error' } })
  })
})

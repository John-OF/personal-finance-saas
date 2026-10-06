import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, loadMigrations, TEST_SCHEMA } from '../test/db'
import { promoteToAdmin } from './admin'
import { migrate } from './migrator'

const USER_A = '00000000-0000-4000-8000-00000000000a'

let db: PGlite

beforeEach(async () => {
  db = await createTestDatabase()
  await migrate(db, TEST_SCHEMA, loadMigrations())
  await db.exec(`insert into auth.users (id, email) values ('${USER_A}', 'ana@example.com')`)
})

afterEach(async () => {
  await db.close()
})

async function accessOf(userId: string) {
  const { rows } = await db.query<{ role: string; status: string }>(
    `select role, status from ${TEST_SCHEMA}.user_access where user_id = $1`,
    [userId],
  )
  return rows[0]
}

describe('promoteToAdmin', () => {
  it('makes the user with that email an admin, ignoring case and spaces', async () => {
    expect(await promoteToAdmin(db, TEST_SCHEMA, '  Ana@Example.com ')).toBe(USER_A)
    expect(await accessOf(USER_A)).toEqual({ role: 'admin', status: 'active' })
  })

  it('keeps the account status of an existing row', async () => {
    await db.exec(
      `insert into ${TEST_SCHEMA}.user_access (user_id, status) values ('${USER_A}', 'suspended')`,
    )
    await promoteToAdmin(db, TEST_SCHEMA, 'ana@example.com')
    expect(await accessOf(USER_A)).toEqual({ role: 'admin', status: 'suspended' })
  })

  it('is idempotent', async () => {
    await promoteToAdmin(db, TEST_SCHEMA, 'ana@example.com')
    await promoteToAdmin(db, TEST_SCHEMA, 'ana@example.com')
    expect(await accessOf(USER_A)).toEqual({ role: 'admin', status: 'active' })
  })

  it('fails without changing anything when no user has that email', async () => {
    await expect(promoteToAdmin(db, TEST_SCHEMA, 'nadie@example.com')).rejects.toThrow(
      /No hay ningún usuario/,
    )
    expect(await accessOf(USER_A)).toBeUndefined()
  })

  it('refuses a schema name that is not a plain identifier', async () => {
    await expect(promoteToAdmin(db, 'app; drop table x', 'ana@example.com')).rejects.toThrow(
      /no válido/,
    )
  })
})

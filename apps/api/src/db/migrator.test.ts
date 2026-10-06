import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, loadMigrations, TEST_ROLE, TEST_SCHEMA } from '../test/db'
import { migrate } from './migrator'

const USER_A = '00000000-0000-4000-8000-00000000000a'
const USER_B = '00000000-0000-4000-8000-00000000000b'

let db: PGlite

beforeEach(async () => {
  db = await createTestDatabase()
})

afterEach(async () => {
  await db.close()
})

async function history() {
  const { rows } = await db.query<{ name: string }>(
    'select name from migrations.history where schema_name = $1 order by name',
    [TEST_SCHEMA],
  )
  return rows.map(({ name }) => name)
}

describe('migrate', () => {
  it('applies every migration in the target schema and records it', async () => {
    const migrations = loadMigrations()
    expect(migrations.length).toBeGreaterThan(0)

    const applied = await migrate(db, TEST_SCHEMA, migrations)

    expect(applied).toEqual(migrations.map(({ name }) => name).sort())
    expect(await history()).toEqual(applied)
    const { rows } = await db.query<{ schema: string }>(
      "select table_schema as schema from information_schema.tables where table_name = 'profiles'",
    )
    expect(rows).toEqual([{ schema: TEST_SCHEMA }])
  })

  it('does nothing when everything is applied', async () => {
    await migrate(db, TEST_SCHEMA, loadMigrations())
    expect(await migrate(db, TEST_SCHEMA, loadMigrations())).toEqual([])
  })

  it('strips the "public" qualifier drizzle-kit adds to foreign keys', async () => {
    const migrations = [
      { name: '0000_a', sql: 'create table parents (id int primary key)' },
      {
        name: '0001_b',
        sql: 'create table children (parent_id int references "public"."parents"(id))',
      },
    ]
    await migrate(db, TEST_SCHEMA, migrations)
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    )
    expect(rows[0]?.n).toBe(0)
  })

  it('refuses to run when an applied migration changed', async () => {
    await migrate(db, TEST_SCHEMA, [{ name: '0000_a', sql: 'create table a (id int)' }])
    await expect(
      migrate(db, TEST_SCHEMA, [{ name: '0000_a', sql: 'create table a (id bigint)' }]),
    ).rejects.toThrow(/cambió/)
  })

  it('ignores line-ending differences', async () => {
    await migrate(db, TEST_SCHEMA, [{ name: '0000_a', sql: 'create table a (\n id int\n)' }])
    await expect(
      migrate(db, TEST_SCHEMA, [{ name: '0000_a', sql: 'create table a (\r\n id int\r\n)' }]),
    ).resolves.toEqual([])
  })

  it('refuses to run when an applied migration is missing', async () => {
    await migrate(db, TEST_SCHEMA, [{ name: '0000_a', sql: 'create table a (id int)' }])
    await expect(migrate(db, TEST_SCHEMA, [])).rejects.toThrow(/no está en el repositorio/)
  })

  it('refuses a pending migration that sorts before an applied one', async () => {
    await migrate(db, TEST_SCHEMA, [{ name: '0001_b', sql: 'create table b (id int)' }])
    await expect(
      migrate(db, TEST_SCHEMA, [
        { name: '0000_a', sql: 'create table a (id int)' },
        { name: '0001_b', sql: 'create table b (id int)' },
      ]),
    ).rejects.toThrow(/va antes de/)
  })

  it('applies nothing when one pending migration fails', async () => {
    const first = { name: '0000_a', sql: 'create table a (id int)' }
    await migrate(db, TEST_SCHEMA, [first])
    await expect(
      migrate(db, TEST_SCHEMA, [
        first,
        { name: '0001_b', sql: 'create table b (id int)' },
        { name: '0002_c', sql: 'create table c (id no_such_type)' },
      ]),
    ).rejects.toThrow()
    expect(await history()).toEqual(['0000_a'])
    const { rows } = await db.query(
      "select 1 from information_schema.tables where table_name = 'b'",
    )
    expect(rows).toEqual([])
  })

  it('refuses a schema that does not exist or is not a plain identifier', async () => {
    await expect(migrate(db, 'app_missing', [])).rejects.toThrow(/no existe/)
    await expect(migrate(db, 'app; drop table x', [])).rejects.toThrow(/no válido/)
  })
})

describe('profiles row-level security', () => {
  beforeEach(async () => {
    await migrate(db, TEST_SCHEMA, loadMigrations())
    await db.exec(`
      insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
      insert into ${TEST_SCHEMA}.profiles (id) values ('${USER_A}'), ('${USER_B}');
      set role ${TEST_ROLE};
      set search_path to ${TEST_SCHEMA};
    `)
  })

  /** Runs `fn` in a transaction as the API would for `userId`. */
  async function asUser<T>(userId: string, fn: () => Promise<T>) {
    await db.exec(`begin; select set_config('app.user_id', '${userId}', true)`)
    try {
      return await fn()
    } finally {
      await db.exec('rollback')
    }
  }

  it('shows nothing when no user is set', async () => {
    const { rows } = await db.query('select id from profiles')
    expect(rows).toEqual([])
  })

  it('shows only the current user profile', async () => {
    const rows = await asUser(USER_A, async () => (await db.query('select id from profiles')).rows)
    expect(rows).toEqual([{ id: USER_A }])
  })

  it("cannot change another user's profile", async () => {
    const result = await asUser(USER_A, () =>
      db.query(`update profiles set display_name = 'x' where id = $1`, [USER_B]),
    )
    expect(result.affectedRows).toBe(0)
  })

  it("cannot create a profile for another user or move one's own", async () => {
    await expect(
      asUser(USER_A, () =>
        db.query(`insert into profiles (id) values ('00000000-0000-4000-8000-00000000000c')`),
      ),
    ).rejects.toThrow(/row-level security/)
    await expect(
      asUser(USER_A, () => db.query('update profiles set id = $1 where id = $2', [USER_B, USER_A])),
    ).rejects.toThrow(/row-level security/)
  })

  it('cannot delete profiles, not even its own', async () => {
    const result = await asUser(USER_A, () =>
      db.query('delete from profiles where id = $1', [USER_A]),
    )
    expect(result.affectedRows).toBe(0)
  })
})

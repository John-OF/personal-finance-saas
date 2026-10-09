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

/** Runs `fn` in a transaction as the API would for `userId` (after `set role` to the API role). */
async function asUser<T>(userId: string, fn: () => Promise<T>) {
  await db.exec(`begin; select set_config('app.user_id', '${userId}', true)`)
  try {
    return await fn()
  } finally {
    await db.exec('rollback')
  }
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

describe('user_access row-level security and privileges', () => {
  beforeEach(async () => {
    await migrate(db, TEST_SCHEMA, loadMigrations())
    await db.exec(`
      insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
      insert into ${TEST_SCHEMA}.user_access (user_id, role)
        values ('${USER_A}', 'admin'), ('${USER_B}', 'user');
      set role ${TEST_ROLE};
      set search_path to ${TEST_SCHEMA};
    `)
  })

  it('lets the API read only the current user row', async () => {
    const rows = await asUser(
      USER_B,
      async () => (await db.query('select user_id, role from user_access')).rows,
    )
    expect(rows).toEqual([{ user_id: USER_B, role: 'user' }])
  })

  it('leaves the API with read-only privileges on the table', async () => {
    const { rows } = await db.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
       where table_name = 'user_access' and grantee = $1 order by privilege_type`,
      [TEST_ROLE],
    )
    expect(rows.map(({ privilege_type }) => privilege_type)).toEqual(['SELECT'])
  })

  it.each([
    ['promote itself', `update user_access set role = 'admin' where user_id = '${USER_B}'`],
    ['create its own row', `insert into user_access (user_id, role) values ('${USER_B}', 'admin')`],
    ['delete a row', `delete from user_access where user_id = '${USER_B}'`],
  ])('does not let a user %s', async (_case, statement) => {
    await expect(asUser(USER_B, () => db.query(statement))).rejects.toThrow(/permission denied/)
  })
})

describe('admin_list_users', () => {
  const OTHER_ROLE = 'someone_else'

  beforeEach(async () => {
    await migrate(db, TEST_SCHEMA, loadMigrations())
    await db.exec(`
      insert into auth.users (id, email) values ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com');
      insert into ${TEST_SCHEMA}.user_access (user_id, role) values ('${USER_A}', 'admin');
      create role ${OTHER_ROLE};
      grant usage on schema ${TEST_SCHEMA} to ${OTHER_ROLE};
      set role ${TEST_ROLE};
      set search_path to ${TEST_SCHEMA};
    `)
  })

  const listEmails = async () =>
    (await db.query<{ email: string }>('select email from admin_list_users(null, 10, 0)')).rows.map(
      ({ email }) => email,
    )

  it('lists every user to an active admin, past row-level security', async () => {
    expect((await asUser(USER_A, listEmails)).sort()).toEqual(['a@example.com', 'b@example.com'])
  })

  it('refuses a regular user, a suspended admin and a request without a user', async () => {
    await expect(asUser(USER_B, listEmails)).rejects.toThrow(/not an admin/)
    await expect(listEmails()).rejects.toThrow(/not an admin/)

    await db.exec(`reset role; update ${TEST_SCHEMA}.user_access set status = 'suspended'`)
    await db.exec(`set role ${TEST_ROLE}`)
    await expect(asUser(USER_A, listEmails)).rejects.toThrow(/not an admin/)
  })

  it('cannot be fooled by a temporary table named like its tables', async () => {
    await db.exec(`reset role; grant temporary on database postgres to ${TEST_ROLE}`)
    await db.exec(`set role ${TEST_ROLE}`)
    await db.exec(`create temporary table user_access (user_id uuid, role text, status text)`)
    await db.exec(`insert into pg_temp.user_access values ('${USER_B}', 'admin', 'active')`)
    await expect(asUser(USER_B, listEmails)).rejects.toThrow(/not an admin/)
  })

  it('may only be called by the API role', async () => {
    await db.exec(`reset role; set role ${OTHER_ROLE}`)
    await expect(asUser(USER_A, listEmails)).rejects.toThrow(/permission denied/)
  })
})

describe('session_is_active', () => {
  beforeEach(async () => {
    await migrate(db, TEST_SCHEMA, loadMigrations())
    // The test database opens a session with the user's id for every user (test/db.ts).
    await db.exec(`
      insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
      set role ${TEST_ROLE};
      set search_path to ${TEST_SCHEMA};
    `)
  })

  const isActive = async (sessionId: string) =>
    (await db.query<{ active: boolean }>('select session_is_active($1) as active', [sessionId]))
      .rows[0]?.active

  it("answers for the caller's own sessions", async () => {
    expect(await asUser(USER_A, () => isActive(USER_A))).toBe(true)
  })

  it('reports a session that was ended or reached its time limit', async () => {
    await db.exec(`reset role; delete from auth.sessions where id = '${USER_A}'`)
    await db.exec(`update auth.sessions set not_after = now() - interval '1 second'`)
    await db.exec(`set role ${TEST_ROLE}`)
    expect(await asUser(USER_A, () => isActive(USER_A))).toBe(false)
    expect(await asUser(USER_B, () => isActive(USER_B))).toBe(false)
  })

  it("says nothing about another user's session, nor without a user", async () => {
    expect(await asUser(USER_B, () => isActive(USER_A))).toBe(false)
    expect(await isActive(USER_A)).toBe(false)
  })
})

describe('commission tables: row-level security and composite foreign keys', () => {
  const PLAN_A = '00000000-0000-4000-8000-0000000000a1'

  beforeEach(async () => {
    await migrate(db, TEST_SCHEMA, loadMigrations())
    await db.exec(`
      insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
      set search_path to ${TEST_SCHEMA};
      insert into profiles (id) values ('${USER_A}'), ('${USER_B}');
      insert into commission_plans (id, user_id, name, period_end_weekday, payday_offset_days)
        values ('${PLAN_A}', '${USER_A}', 'A', 6, 0);
      insert into commission_entries (user_id, plan_id, date, amount_cents)
        values ('${USER_A}', '${PLAN_A}', '2026-10-05', 1000);
      set role ${TEST_ROLE};
    `)
  })

  it("shows nothing of another user's plan", async () => {
    const counts = await asUser(USER_B, async () => {
      const plans = await db.query('select 1 from commission_plans')
      const entries = await db.query('select 1 from commission_entries')
      return [plans.rows.length, entries.rows.length]
    })
    expect(counts).toEqual([0, 0])
  })

  it("cannot hang an entry on another user's plan, under either user id", async () => {
    const insert = (userId: string) =>
      db.query(
        `insert into commission_entries (user_id, plan_id, date, amount_cents)
         values ($1, '${PLAN_A}', '2026-10-06', 1)`,
        [userId],
      )
    // As itself: the composite foreign key finds no plan (B, PLAN_A).
    await expect(asUser(USER_B, () => insert(USER_B))).rejects.toThrow(/foreign key/)
    // As the owner: row-level security refuses a row for someone else.
    await expect(asUser(USER_B, () => insert(USER_A))).rejects.toThrow(/row-level security/)
  })
})

describe('finance tables', () => {
  it('give the profiles that already existed the default categories (0007)', async () => {
    const all = loadMigrations()
    const before = all.filter(({ name }) => name < '0007')
    await migrate(db, TEST_SCHEMA, before)
    await db.exec(`
      insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
      set search_path to ${TEST_SCHEMA};
      insert into profiles (id) values ('${USER_A}'), ('${USER_B}');
      insert into categories (user_id, kind, name) values ('${USER_A}', 'expense', 'comida');
    `)
    await migrate(db, TEST_SCHEMA, all)

    const { rows } = await db.query<{ user_id: string; kind: string; n: number }>(
      `select user_id, kind, count(*)::int as n from categories group by user_id, kind
       order by user_id, kind`,
    )
    expect(rows).toEqual([
      { user_id: USER_A, kind: 'expense', n: 8 },
      { user_id: USER_A, kind: 'income', n: 4 },
      { user_id: USER_B, kind: 'expense', n: 8 },
      { user_id: USER_B, kind: 'income', n: 4 },
    ])
    // The category the user already had keeps its name.
    const mine = await db.query(`select 1 from categories where name = 'comida'`)
    expect(mine.rows).toHaveLength(1)
  })

  it("show nothing of another user's accounts, categories or transactions", async () => {
    await migrate(db, TEST_SCHEMA, loadMigrations())
    await db.exec(`
      insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
      set search_path to ${TEST_SCHEMA};
      insert into profiles (id) values ('${USER_A}'), ('${USER_B}');
      insert into categories (user_id, kind, name) values ('${USER_A}', 'expense', 'Comida');
      insert into accounts (user_id, name, type) values ('${USER_A}', 'Efectivo', 'cash');
      insert into transactions (user_id, kind, date, amount_cents, account_id, category_id)
        select '${USER_A}', 'expense', '2026-10-08', 100, a.id, c.id from accounts a, categories c;
      set role ${TEST_ROLE};
    `)
    const counts = await asUser(USER_B, async () => {
      const count = async (table: string) => (await db.query(`select 1 from ${table}`)).rows.length
      return [await count('accounts'), await count('categories'), await count('transactions')]
    })
    expect(counts).toEqual([0, 0, 0])
    const own = await asUser(
      USER_A,
      async () => (await db.query('select 1 from transactions')).rows,
    )
    expect(own).toHaveLength(1)
  })
})

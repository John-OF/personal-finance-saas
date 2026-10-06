import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { migrate, type Migration } from '../db/migrator'

/** Stand-ins for the `app` schema and the pf_api role. */
export const TEST_SCHEMA = 'app_test'
export const TEST_ROLE = 'pf_api_test'

/** The migrations in apps/api/drizzle, as scripts/db-migrate.js reads them. */
export function loadMigrations(): Migration[] {
  const files = import.meta.glob<string>('../../drizzle/*.sql', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  return Object.entries(files).map(([path, sql]) => ({
    name: path.slice(path.lastIndexOf('/') + 1).replace(/\.sql$/, ''),
    sql,
  }))
}

/** An empty Postgres prepared like scripts/bootstrap-db.sql, plus the bit of Supabase Auth we use. */
export async function createTestDatabase() {
  const db = await PGlite.create()
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);

    create schema ${TEST_SCHEMA};
    create role ${TEST_ROLE} noinherit;
    grant usage on schema ${TEST_SCHEMA} to ${TEST_ROLE};
    alter default privileges in schema ${TEST_SCHEMA}
      grant select, insert, update, delete on tables to ${TEST_ROLE};
    alter default privileges in schema ${TEST_SCHEMA}
      grant usage, select on sequences to ${TEST_ROLE};
  `)
  return db
}

/**
 * A migrated database served over TCP, so the API connects with `pg` exactly as it does through
 * Hyperdrive. PGlite has a single session: it is switched to the API role (no superuser, RLS applies)
 * and `asAdmin` switches back temporarily for test setup.
 */
export async function startApiDatabase() {
  const db = await createTestDatabase()
  await migrate(db, TEST_SCHEMA, loadMigrations())
  const actAsApi = () => db.exec(`set role ${TEST_ROLE}; set search_path to ${TEST_SCHEMA}`)
  await actAsApi()

  const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 10 })
  await server.start()

  return {
    db,
    connectionString: `postgresql://${TEST_ROLE}@${server.getServerConn()}/postgres`,
    async asAdmin<T>(fn: (db: PGlite) => Promise<T>) {
      await db.exec('reset role')
      try {
        return await fn(db)
      } finally {
        await actAsApi()
      }
    },
    async stop() {
      await server.stop()
      await db.close()
    },
  }
}

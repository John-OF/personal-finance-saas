// Account administration that only `postgres` may do, used by scripts/admin-promote.js. Like
// migrator.ts it has no runtime imports, so Node can run it directly and the tests can use PGlite.
import type { SqlClient } from './migrator'

const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/

/**
 * Makes the Supabase Auth user with this email an admin in `schema` (`app` or `app_dev`: the Auth
 * users are shared, the roles are not). Idempotent. Returns the user id.
 */
export async function promoteToAdmin(db: SqlClient, schema: string, email: string) {
  if (!SCHEMA_NAME.test(schema)) throw new Error(`Nombre de schema no válido: ${schema}`)

  await db.query('begin')
  try {
    await db.query(`set local search_path to ${schema}`)
    const { rows } = await db.query('select id from auth.users where lower(email) = lower($1)', [
      email.trim(),
    ])
    const [user] = rows as { id: string }[]
    if (!user) throw new Error(`No hay ningún usuario registrado con el correo ${email}.`)

    await db.query(
      `insert into user_access (user_id, role) values ($1, 'admin')
       on conflict (user_id) do update set role = 'admin', updated_at = now()`,
      [user.id],
    )
    await db.query('commit')
    return user.id
  } catch (err) {
    await db.query('rollback')
    throw err
  }
}

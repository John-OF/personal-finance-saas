import type { AccountStatus, AdminUser, ModuleId } from '@pf/shared'
import { sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import type { UserRole } from '../../db/schema'

interface AdminUserRow extends Record<string, unknown> {
  id: string
  email: string | null
  display_name: string | null
  role: UserRole
  status: AccountStatus
  created_at: string | null
  email_confirmed_at: string | null
  last_sign_in_at: string | null
  has_profile: boolean
  onboarded_at: string | null
  enabled_modules: ModuleId[] | null
  /** bigint, which node-postgres returns as a string. */
  total_count: string
}

// Drizzle leaves timestamps as Postgres text in raw queries ('2026-10-04 10:00:00+00') and only turns
// them into dates for declared columns, the same way as here.
const iso = (value: string | null) => (value === null ? null : new Date(value).toISOString())

/**
 * One page of users, through the admin_list_users database function (migration 0003): the API role
 * cannot read auth.users nor other users' profiles, and the function refuses non-admins.
 */
export async function listUsers(
  db: Db,
  { search, limit, offset }: { search: string | null; limit: number; offset: number },
) {
  const { rows } = await db.execute<AdminUserRow>(
    sql`select * from admin_list_users(${search}, ${limit}, ${offset})`,
  )
  const users = rows.map((row): AdminUser => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: iso(row.created_at),
    emailConfirmedAt: iso(row.email_confirmed_at),
    lastSignInAt: iso(row.last_sign_in_at),
    profile: row.has_profile
      ? {
          displayName: row.display_name,
          onboardedAt: iso(row.onboarded_at),
          enabledModules: row.enabled_modules ?? [],
        }
      : null,
  }))
  // Past the last page there are no rows to carry the count.
  return { users, total: rows[0] ? Number(rows[0].total_count) : 0 }
}

import { MODULE_IDS, type ModuleId, type ThemePreference } from '@pf/shared'
import { sql } from 'drizzle-orm'
import {
  check,
  jsonb,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'

// Tables are declared without a schema: the role's search_path decides between `app` and `app_dev`
// (see scripts/bootstrap-db.sql and scripts/db-migrate.js).

/**
 * The user of the current transaction, set by the withUserDb middleware. Outside such a transaction
 * it is NULL, so every policy that compares against it matches no rows (fails closed).
 */
const currentUserId = sql`nullif(current_setting('app.user_id', true), '')::uuid`

export const profiles = pgTable(
  'profiles',
  {
    // Deleting the Supabase Auth user deletes the profile and, through it, all the user's data.
    id: uuid('id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    displayName: text('display_name'),
    currency: text('currency').notNull().default('USD'),
    locale: text('locale').notNull().default('es-EC'),
    timezone: text('timezone').notNull().default('America/Guayaquil'),
    // ISO weekday: 1 = Monday … 7 = Sunday.
    weekStartsOn: smallint('week_starts_on').notNull().default(1),
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
    // All modules until the setup wizard asks.
    enabledModules: text('enabled_modules')
      .array()
      .$type<ModuleId[]>()
      .notNull()
      .default(sql`'{${sql.raw(MODULE_IDS.join(','))}}'`),
    // Null until the user picks a theme; validated by the API (themePreferenceSchema).
    theme: jsonb('theme').$type<ThemePreference>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('profiles_display_name_length', sql`char_length(${t.displayName}) between 1 and 80`),
    check(
      'profiles_enabled_modules_valid',
      sql`cardinality(${t.enabledModules}) >= 1 and ${t.enabledModules} <@ '{${sql.raw(MODULE_IDS.join(','))}}'::text[]`,
    ),
    check('profiles_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('profiles_week_starts_on_range', sql`${t.weekStartsOn} between 1 and 7`),
    // No delete policy: accounts are deleted through Supabase Auth, which cascades here.
    pgPolicy('profiles_select_own', { for: 'select', using: sql`id = ${currentUserId}` }),
    pgPolicy('profiles_insert_own', { for: 'insert', withCheck: sql`id = ${currentUserId}` }),
    pgPolicy('profiles_update_own', {
      for: 'update',
      using: sql`id = ${currentUserId}`,
      withCheck: sql`id = ${currentUserId}`,
    }),
  ],
)

export type ProfileRow = typeof profiles.$inferSelect

/**
 * Role and account status, kept out of `profiles` because users may edit their own profile row: a
 * bug there must not let anyone make themselves an admin (plan §7.8). The API can only read its
 * own row; writes come from scripts run as `postgres` (admin:promote) and, later, from
 * security-definer functions. No row means role `user`, status `active`.
 */
export const userAccess = pgTable(
  'user_access',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),
    status: text('status', { enum: ['active', 'suspended'] })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('user_access_role_valid', sql`${t.role} in ('user', 'admin')`),
    check('user_access_status_valid', sql`${t.status} in ('active', 'suspended')`),
    // Read-only for the API: no insert, update or delete policy.
    pgPolicy('user_access_select_own', { for: 'select', using: sql`user_id = ${currentUserId}` }),
  ],
)

export type UserRole = (typeof userAccess.$inferSelect)['role']

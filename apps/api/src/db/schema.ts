import { sql } from 'drizzle-orm'
import { check, pgPolicy, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core'
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('profiles_display_name_length', sql`char_length(${t.displayName}) between 1 and 80`),
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

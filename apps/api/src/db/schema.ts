import {
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  CATEGORY_NAME_MAX_LENGTH,
  COMMISSION_NOTE_MAX_LENGTH,
  COMMISSION_PLAN_NAME_MAX_LENGTH,
  FULL_PERCENT_BP,
  MAX_AMOUNT_CENTS,
  MODULE_IDS,
  TRANSACTION_KINDS,
  TRANSACTION_NOTE_MAX_LENGTH,
  type ModuleId,
  type ThemePreference,
} from '@pf/shared'
import { sql, type SQL } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

/** Every operation limited to the current user's rows (plan §7.8). */
function ownRowPolicies(table: string, userId: SQL) {
  const own = sql`${userId} = ${currentUserId}`
  return [
    pgPolicy(`${table}_select_own`, { for: 'select', using: own }),
    pgPolicy(`${table}_insert_own`, { for: 'insert', withCheck: own }),
    pgPolicy(`${table}_update_own`, { for: 'update', using: own, withCheck: own }),
    pgPolicy(`${table}_delete_own`, { for: 'delete', using: own }),
  ]
}

const percentBpCheck = (column: SQL) =>
  sql`${column} between 1 and ${sql.raw(String(FULL_PERCENT_BP))}`
const amountCheck = (column: SQL, min: number) =>
  sql`${column} between ${sql.raw(String(min))} and ${sql.raw(String(MAX_AMOUNT_CENTS))}`

/**
 * Commission income (plan §6.2, §7.4). A plan cuts weeks that end on `period_end_weekday` and are
 * paid `payday_offset_days` later (0 = Sunday … 6 = Saturday). The percentage lives in
 * commission_rates so that changing it does not rewrite past weeks.
 */
export const commissionPlans = pgTable(
  'commission_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    periodEndWeekday: smallint('period_end_weekday').notNull(),
    paydayOffsetDays: smallint('payday_offset_days').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Target of the composite foreign keys below: rows can only point at plans of their own user.
    unique('commission_plans_user_id_id_unique').on(t.userId, t.id),
    check(
      'commission_plans_name_length',
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(COMMISSION_PLAN_NAME_MAX_LENGTH))}`,
    ),
    check('commission_plans_period_end_weekday_range', sql`${t.periodEndWeekday} between 0 and 6`),
    check('commission_plans_payday_offset_days_range', sql`${t.paydayOffsetDays} between 0 and 6`),
    ...ownRowPolicies('commission_plans', sql`${t.userId}`),
  ],
)

export const commissionRates = pgTable(
  'commission_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    planId: uuid('plan_id').notNull(),
    percentBp: integer('percent_bp').notNull(),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'commission_rates_plan_fk',
      columns: [t.userId, t.planId],
      foreignColumns: [commissionPlans.userId, commissionPlans.id],
    }).onDelete('cascade'),
    unique('commission_rates_plan_id_effective_from_unique').on(t.planId, t.effectiveFrom),
    check('commission_rates_percent_bp_range', percentBpCheck(sql`${t.percentBp}`)),
    ...ownRowPolicies('commission_rates', sql`${t.userId}`),
  ],
)

/** What was made each day. Deleting sets `deleted_at`, so "Deshacer" can bring it back. */
export const commissionEntries = pgTable(
  'commission_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    planId: uuid('plan_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: 'commission_entries_plan_fk',
      columns: [t.userId, t.planId],
      foreignColumns: [commissionPlans.userId, commissionPlans.id],
    }).onDelete('cascade'),
    index('commission_entries_plan_id_date_idx').on(t.planId, t.date),
    check('commission_entries_amount_cents_range', amountCheck(sql`${t.amountCents}`, 1)),
    check(
      'commission_entries_note_length',
      sql`char_length(${t.note}) <= ${sql.raw(String(COMMISSION_NOTE_MAX_LENGTH))}`,
    ),
    ...ownRowPolicies('commission_entries', sql`${t.userId}`),
  ],
)

/**
 * A confirmed payment, one per plan and payday, with the week's figures as they were when it was
 * confirmed: later edits to the entries or the percentage do not change a week already paid.
 */
export const commissionPayouts = pgTable(
  'commission_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    planId: uuid('plan_id').notNull(),
    payday: date('payday', { mode: 'string' }).notNull(),
    grossCents: bigint('gross_cents', { mode: 'number' }).notNull(),
    percentBp: integer('percent_bp').notNull(),
    expectedCents: bigint('expected_cents', { mode: 'number' }).notNull(),
    paidCents: bigint('paid_cents', { mode: 'number' }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'commission_payouts_plan_fk',
      columns: [t.userId, t.planId],
      foreignColumns: [commissionPlans.userId, commissionPlans.id],
    }).onDelete('cascade'),
    unique('commission_payouts_plan_id_payday_unique').on(t.planId, t.payday),
    check('commission_payouts_percent_bp_range', percentBpCheck(sql`${t.percentBp}`)),
    check('commission_payouts_gross_cents_range', sql`${t.grossCents} >= 0`),
    check('commission_payouts_expected_cents_range', sql`${t.expectedCents} >= 0`),
    check('commission_payouts_paid_cents_range', amountCheck(sql`${t.paidCents}`, 0)),
    ...ownRowPolicies('commission_payouts', sql`${t.userId}`),
  ],
)

/** `'a', 'b'` for a CHECK against a list of constants from @pf/shared. */
const sqlList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '))
const nameLengthCheck = (column: SQL, max: number) =>
  sql`char_length(${column}) between 1 and ${sql.raw(String(max))}`

/**
 * Where the money is (plan §3.2). The balance is not stored: it is the initial balance plus the
 * account's transactions. Accounts with transactions cannot be deleted, only archived.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
    // Negative for a card or an account that starts in debt.
    initialBalanceCents: bigint('initial_balance_cents', { mode: 'number' }).notNull().default(0),
    includeInNetWorth: boolean('include_in_net_worth').notNull().default(true),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('accounts_user_id_id_unique').on(t.userId, t.id),
    check('accounts_name_length', nameLengthCheck(sql`${t.name}`, ACCOUNT_NAME_MAX_LENGTH)),
    check('accounts_type_valid', sql`${t.type} in (${sqlList(ACCOUNT_TYPES)})`),
    check(
      'accounts_initial_balance_cents_range',
      sql`${t.initialBalanceCents} between ${sql.raw(String(-MAX_AMOUNT_CENTS))} and ${sql.raw(String(MAX_AMOUNT_CENTS))}`,
    ),
    ...ownRowPolicies('accounts', sql`${t.userId}`),
  ],
)

/** Income and expense categories, unique by name (ignoring case) within each kind. */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull(),
    name: text('name').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Target of the transactions' foreign key, which also makes the category's kind match theirs.
    unique('categories_user_id_id_kind_unique').on(t.userId, t.id, t.kind),
    uniqueIndex('categories_user_id_kind_name_unique').on(t.userId, t.kind, sql`lower(${t.name})`),
    check('categories_name_length', nameLengthCheck(sql`${t.name}`, CATEGORY_NAME_MAX_LENGTH)),
    check('categories_kind_valid', sql`${t.kind} in (${sqlList(CATEGORY_KINDS)})`),
    ...ownRowPolicies('categories', sql`${t.userId}`),
  ],
)

/**
 * Money that came in, went out or moved between accounts (plan §6.2). The amount is always
 * positive; the kind gives the sign. Deleting sets `deleted_at`, so "Deshacer" can bring it back.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Deleting the profile deletes the transactions in the same statement as their accounts and
    // categories, so the foreign keys below (no action) do not stop it.
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: TRANSACTION_KINDS }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    accountId: uuid('account_id').notNull(),
    toAccountId: uuid('to_account_id'),
    categoryId: uuid('category_id'),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: 'transactions_account_fk',
      columns: [t.userId, t.accountId],
      foreignColumns: [accounts.userId, accounts.id],
    }),
    foreignKey({
      name: 'transactions_to_account_fk',
      columns: [t.userId, t.toAccountId],
      foreignColumns: [accounts.userId, accounts.id],
    }),
    // Includes the kind: an expense can only use an expense category, and income an income one.
    foreignKey({
      name: 'transactions_category_fk',
      columns: [t.userId, t.categoryId, t.kind],
      foreignColumns: [categories.userId, categories.id, categories.kind],
    }),
    index('transactions_user_id_date_idx').on(t.userId, t.date.desc(), t.createdAt.desc()),
    index('transactions_user_id_account_id_date_idx').on(t.userId, t.accountId, t.date),
    index('transactions_user_id_to_account_id_idx')
      .on(t.userId, t.toAccountId)
      .where(sql`${t.toAccountId} is not null`),
    index('transactions_user_id_category_id_date_idx').on(t.userId, t.categoryId, t.date),
    check('transactions_kind_valid', sql`${t.kind} in (${sqlList(TRANSACTION_KINDS)})`),
    check('transactions_amount_cents_range', amountCheck(sql`${t.amountCents}`, 1)),
    check(
      'transactions_note_length',
      sql`char_length(${t.note}) <= ${sql.raw(String(TRANSACTION_NOTE_MAX_LENGTH))}`,
    ),
    // A transfer goes to another account and has no category; income and expenses are the opposite.
    check(
      'transactions_kind_fields',
      sql`case when ${t.kind} = 'transfer'
        then ${t.toAccountId} is not null and ${t.toAccountId} <> ${t.accountId} and ${t.categoryId} is null
        else ${t.toAccountId} is null and ${t.categoryId} is not null end`,
    ),
    ...ownRowPolicies('transactions', sql`${t.userId}`),
  ],
)

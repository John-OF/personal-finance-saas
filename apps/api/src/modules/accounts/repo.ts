import { BALANCE_SIGN, type Account, type AccountInput, type AccountUpdate } from '@pf/shared'
import { and, asc, eq, notExists, or, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { accounts, transactions } from '../../db/schema'
import { findOrCreateProfile } from '../profiles/repo'

// Every query filters by the session user besides row-level security (plan §9.3).

const signs = sql.raw(
  Object.entries(BALANCE_SIGN)
    .map(([kind, sign]) => `when '${kind}' then ${sign}`)
    .join(' '),
)

/**
 * The initial balance plus every transaction that moves the account, added up in the database.
 * Written with explicit names: in selected fields Drizzle leaves columns unqualified, and `id`
 * inside the subquery would be the transaction's.
 */
const balanceCents = sql<number>`${accounts.initialBalanceCents} + coalesce((
  select sum(case when t.account_id = accounts.id
    then (case t.kind ${signs} end) * t.amount_cents
    else t.amount_cents end)
  from ${transactions} t
  where t.user_id = accounts.user_id
    and t.deleted_at is null
    and (t.account_id = accounts.id or t.to_account_id = accounts.id)
), 0)`.mapWith(Number)

const accountColumns = {
  id: accounts.id,
  name: accounts.name,
  type: accounts.type,
  initialBalanceCents: accounts.initialBalanceCents,
  includeInNetWorth: accounts.includeInNetWorth,
  archivedAt: accounts.archivedAt,
  balanceCents,
}

function toAccount({
  archivedAt,
  ...row
}: { archivedAt: Date | null } & Omit<Account, 'archived'>): Account {
  return { ...row, archived: archivedAt !== null }
}

/** Open accounts first, then in the order they were created. */
export async function listAccounts(db: Db, userId: string) {
  const rows = await db
    .select(accountColumns)
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(sql`${accounts.archivedAt} is not null`, asc(accounts.createdAt))
  return rows.map(toAccount)
}

/** The account with its balance, or null when it does not exist or belongs to someone else. */
export async function findAccount(db: Db, userId: string, accountId: string) {
  const [row] = await db
    .select(accountColumns)
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
  return row ? toAccount(row) : null
}

export async function createAccount(db: Db, userId: string, input: AccountInput) {
  // The account references the profile, which /me creates; an API client may come here first.
  await findOrCreateProfile(db, userId)
  const [row] = await db
    .insert(accounts)
    .values({ ...input, userId })
    .returning({ id: accounts.id })
  const account = row && (await findAccount(db, userId, row.id))
  if (!account) throw new Error('account not created')
  return account
}

export async function updateAccount(
  db: Db,
  userId: string,
  accountId: string,
  { archived, ...fields }: AccountUpdate,
) {
  const [row] = await db
    .update(accounts)
    .set({
      ...fields,
      ...(archived !== undefined && {
        archivedAt: archived ? sql`coalesce(${accounts.archivedAt}, now())` : null,
      }),
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
    .returning({ id: accounts.id })
  return row ? findAccount(db, userId, row.id) : null
}

/**
 * Deletes an account without transactions (deleted ones count too: "Deshacer" may bring them back).
 * One with transactions can only be archived.
 */
export async function deleteAccount(db: Db, userId: string, accountId: string) {
  const deleted = await db
    .delete(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.id, accountId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, userId),
                or(
                  eq(transactions.accountId, accounts.id),
                  eq(transactions.toAccountId, accounts.id),
                ),
              ),
            ),
        ),
      ),
    )
    .returning({ id: accounts.id })
  if (deleted.length > 0) return 'deleted'
  return (await findAccount(db, userId, accountId)) ? 'in_use' : 'not_found'
}

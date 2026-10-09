import {
  isDateKey,
  TRANSACTIONS_PAGE_SIZE,
  type Transaction,
  type TransactionInput,
  type TransactionsQuery,
  type TransactionsResponse,
} from '@pf/shared'
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { accounts, categories, transactions } from '../../db/schema'
import { isUuid } from '../../lib/ids'

// Every query filters by the session user besides row-level security (plan §9.3).

type TransactionRow = typeof transactions.$inferSelect

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    kind: row.kind,
    date: row.date,
    amountCents: row.amountCents,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    note: row.note,
  }
}

/** The columns of a transaction, with the fields of the other kinds cleared. */
function columnsOf(input: TransactionInput) {
  const { note = '', ...fields } = input
  return fields.kind === 'transfer'
    ? { ...fields, note, categoryId: null }
    : { ...fields, note, toAccountId: null }
}

/**
 * Field errors for accounts or a category that are not the user's (or a category of another
 * kind); null when they all are. The foreign keys would reject them too, but without saying which.
 */
export async function referenceErrors(db: Db, userId: string, input: TransactionInput) {
  const accountIds = [input.accountId, ...(input.kind === 'transfer' ? [input.toAccountId] : [])]
  const owned = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), inArray(accounts.id, accountIds)))
  const ownedIds = new Set(owned.map(({ id }) => id))
  const errors: Record<string, string[]> = {}
  if (!ownedIds.has(input.accountId)) errors.accountId = ['Elige una de tus cuentas.']
  if (input.kind === 'transfer') {
    if (!ownedIds.has(input.toAccountId)) errors.toAccountId = ['Elige una de tus cuentas.']
  } else {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.id, input.categoryId),
          eq(categories.kind, input.kind),
        ),
      )
    if (!category) errors.categoryId = ['Elige una de tus categorías.']
  }
  return Object.keys(errors).length > 0 ? errors : null
}

/**
 * Pages go newest first: by date, then by when they were recorded, then by id. The cursor carries
 * the last row's three values; created_at travels as Postgres prints it, keeping its microseconds.
 */
interface Cursor {
  date: string
  createdAt: string
  id: string
}

const CREATED_AT_TEXT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/

const encodeCursor = ({ date, createdAt, id }: Cursor) => btoa(`${date}|${createdAt}|${id}`)

/** Null for anything that is not a cursor this API gave out. */
export function decodeCursor(cursor: string): Cursor | null {
  let text: string
  try {
    text = atob(cursor)
  } catch {
    return null
  }
  const [date, createdAt, id, ...rest] = text.split('|')
  if (
    rest.length > 0 ||
    !isDateKey(date) ||
    !isUuid(id) ||
    !CREATED_AT_TEXT.test(createdAt ?? '')
  ) {
    return null
  }
  return { date, createdAt: createdAt ?? '', id }
}

/** `%` and `_` typed by the user are searched literally. */
const containsPattern = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`

function filtersOf(db: Db, userId: string, query: TransactionsQuery) {
  const { from, to, kind, accountId, categoryId, q } = query
  const pattern = q ? containsPattern(q) : null
  return and(
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
    from ? gte(transactions.date, from) : undefined,
    to ? lte(transactions.date, to) : undefined,
    kind ? eq(transactions.kind, kind) : undefined,
    accountId
      ? or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId))
      : undefined,
    categoryId ? eq(transactions.categoryId, categoryId) : undefined,
    pattern
      ? or(
          ilike(transactions.note, pattern),
          inArray(
            transactions.categoryId,
            db
              .select({ id: categories.id })
              .from(categories)
              .where(and(eq(categories.userId, userId), ilike(categories.name, pattern))),
          ),
        )
      : undefined,
  )
}

/** One page of the transactions the filters match; the first page also brings their totals. */
export async function listTransactions(
  db: Db,
  userId: string,
  query: TransactionsQuery,
  cursor: Cursor | null,
): Promise<TransactionsResponse> {
  const limit = query.limit ?? TRANSACTIONS_PAGE_SIZE
  const filters = filtersOf(db, userId, query)
  const rows = await db
    .select({ row: transactions, createdAtText: sql<string>`${transactions.createdAt}::text` })
    .from(transactions)
    .where(
      and(
        filters,
        cursor
          ? sql`(${transactions.date}, ${transactions.createdAt}, ${transactions.id}) < (${cursor.date}::date, ${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
    .limit(limit + 1)

  const page = rows.slice(0, limit)
  const last = page.at(-1)
  const nextCursor =
    rows.length > limit && last
      ? encodeCursor({ date: last.row.date, createdAt: last.createdAtText, id: last.row.id })
      : null

  let totals: TransactionsResponse['totals'] = null
  if (!cursor) {
    const sumOf = (kind: string) =>
      sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.kind} = ${kind}), 0)`.mapWith(
        Number,
      )
    const [row] = await db
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        incomeCents: sumOf('income'),
        expenseCents: sumOf('expense'),
      })
      .from(transactions)
      .where(filters)
    totals = row ?? { count: 0, incomeCents: 0, expenseCents: 0 }
  }

  return { transactions: page.map(({ row }) => toTransaction(row)), nextCursor, totals }
}

export async function createTransaction(db: Db, userId: string, input: TransactionInput) {
  const [row] = await db
    .insert(transactions)
    .values({ ...columnsOf(input), userId })
    .returning()
  if (!row) throw new Error('transaction not created')
  return toTransaction(row)
}

/** Replaces every field of a transaction that has not been deleted. */
export async function updateTransaction(
  db: Db,
  userId: string,
  transactionId: string,
  input: TransactionInput,
) {
  const [row] = await db
    .update(transactions)
    .set(columnsOf(input))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, transactionId),
        isNull(transactions.deletedAt),
      ),
    )
    .returning()
  return row ? toTransaction(row) : null
}

/** Soft delete (plan §6.1), so that "Deshacer" can restore it. */
export async function deleteTransaction(db: Db, userId: string, transactionId: string) {
  const rows = await db
    .update(transactions)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, transactionId),
        isNull(transactions.deletedAt),
      ),
    )
    .returning({ id: transactions.id })
  return rows.length > 0
}

export async function restoreTransaction(db: Db, userId: string, transactionId: string) {
  const [row] = await db
    .update(transactions)
    .set({ deletedAt: null })
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.id, transactionId),
        isNotNull(transactions.deletedAt),
      ),
    )
    .returning()
  return row ? toTransaction(row) : null
}

import { monthRange, type MonthSummary } from '@pf/shared'
import { and, asc, between, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { transactions } from '../../db/schema'

// Every query filters by the session user besides row-level security (plan §9.3).

/** Income and expenses of a month, by category and by day, added up in the database. */
export async function monthSummary(db: Db, userId: string, month: string): Promise<MonthSummary> {
  const { from, to } = monthRange(month)
  const inMonth = and(
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
    inArray(transactions.kind, ['income', 'expense']),
    between(transactions.date, from, to),
  )
  const total = sql<number>`sum(${transactions.amountCents})`.mapWith(Number)
  const totalOf = (kind: string) =>
    sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.kind} = ${kind}), 0)`.mapWith(
      Number,
    )

  const byCategory = await db
    .select({ categoryId: transactions.categoryId, kind: transactions.kind, totalCents: total })
    .from(transactions)
    .where(inMonth)
    .groupBy(transactions.categoryId, transactions.kind)
    .orderBy(desc(total))
  const days = await db
    .select({
      date: transactions.date,
      incomeCents: totalOf('income'),
      expenseCents: totalOf('expense'),
    })
    .from(transactions)
    .where(inMonth)
    .groupBy(transactions.date)
    .orderBy(asc(transactions.date))

  const categories: MonthSummary['categories'] = []
  for (const { categoryId, kind, totalCents } of byCategory) {
    // Income and expenses always have a category (transactions_kind_fields).
    if (categoryId && kind !== 'transfer') categories.push({ categoryId, kind, totalCents })
  }
  const sumOf = (kind: string) =>
    categories.filter((c) => c.kind === kind).reduce((sum, c) => sum + c.totalCents, 0)
  return {
    month,
    incomeCents: sumOf('income'),
    expenseCents: sumOf('expense'),
    categories,
    days,
  }
}

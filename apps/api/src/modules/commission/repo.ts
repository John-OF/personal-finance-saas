import {
  commissionWeekByPayday,
  expectedShareCents,
  rateOn,
  summarizeWeeks,
  todayIn,
  type CommissionEntry,
  type CommissionEntryInput,
  type CommissionEntryUpdate,
  type CommissionImportInput,
  type CommissionPayout,
  type CommissionPlan,
  type CommissionPlanInput,
  type CommissionPlanUpdate,
  type CommissionRateInput,
} from '@pf/shared'
import { and, asc, between, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import {
  commissionEntries,
  commissionPayouts,
  commissionPlans,
  commissionRates,
} from '../../db/schema'
import { findOrCreateProfile } from '../profiles/repo'

// Every query filters by the session user besides row-level security (plan §9.3): either barrier
// alone keeps users apart.

type PlanRow = typeof commissionPlans.$inferSelect
type EntryRow = typeof commissionEntries.$inferSelect
type PayoutRow = typeof commissionPayouts.$inferSelect

function toEntry(row: EntryRow): CommissionEntry {
  return {
    id: row.id,
    date: row.date,
    amountCents: row.amountCents,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }
}

function toPayout(row: PayoutRow): CommissionPayout {
  return {
    payday: row.payday,
    grossCents: row.grossCents,
    percentBp: row.percentBp,
    expectedCents: row.expectedCents,
    paidCents: row.paidCents,
    paidAt: row.paidAt.toISOString(),
  }
}

async function ratesOf(db: Db, userId: string, planIds: string[]) {
  if (planIds.length === 0) return []
  return db
    .select({
      planId: commissionRates.planId,
      percentBp: commissionRates.percentBp,
      effectiveFrom: commissionRates.effectiveFrom,
    })
    .from(commissionRates)
    .where(and(eq(commissionRates.userId, userId), inArray(commissionRates.planId, planIds)))
    .orderBy(asc(commissionRates.effectiveFrom))
}

function toPlan(row: PlanRow, rates: Awaited<ReturnType<typeof ratesOf>>): CommissionPlan {
  return {
    id: row.id,
    name: row.name,
    periodEndWeekday: row.periodEndWeekday,
    paydayOffsetDays: row.paydayOffsetDays,
    rates: rates
      .filter(({ planId }) => planId === row.id)
      .map(({ percentBp, effectiveFrom }) => ({ percentBp, effectiveFrom })),
  }
}

export async function listPlans(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(commissionPlans)
    .where(eq(commissionPlans.userId, userId))
    .orderBy(asc(commissionPlans.createdAt))
  const rates = await ratesOf(
    db,
    userId,
    rows.map(({ id }) => id),
  )
  return rows.map((row) => toPlan(row, rates))
}

/** The plan with its rates, or null when it does not exist or belongs to someone else. */
export async function findPlan(db: Db, userId: string, planId: string) {
  const [row] = await db
    .select()
    .from(commissionPlans)
    .where(and(eq(commissionPlans.userId, userId), eq(commissionPlans.id, planId)))
  if (!row) return null
  return toPlan(row, await ratesOf(db, userId, [row.id]))
}

/** Creates a plan whose first percentage starts today (it also covers any earlier weeks). */
export async function createPlan(db: Db, userId: string, input: CommissionPlanInput) {
  // The plan references the profile, which /me creates; an API client may come here first.
  const profile = await findOrCreateProfile(db, userId)
  const { percentBp, ...fields } = input
  const [row] = await db
    .insert(commissionPlans)
    .values({ ...fields, userId })
    .returning()
  if (!row) throw new Error('plan not created')
  await db
    .insert(commissionRates)
    .values({ userId, planId: row.id, percentBp, effectiveFrom: todayIn(profile.timezone) })
  return toPlan(row, await ratesOf(db, userId, [row.id]))
}

export async function updatePlan(
  db: Db,
  userId: string,
  planId: string,
  update: CommissionPlanUpdate,
) {
  const [row] = await db
    .update(commissionPlans)
    .set(update)
    .where(and(eq(commissionPlans.userId, userId), eq(commissionPlans.id, planId)))
    .returning()
  if (!row) return null
  return toPlan(row, await ratesOf(db, userId, [row.id]))
}

/** Sets the percentage from a date on, replacing the one that started that same day. */
export async function upsertRate(
  db: Db,
  userId: string,
  planId: string,
  { percentBp, effectiveFrom }: CommissionRateInput,
) {
  await db
    .insert(commissionRates)
    .values({ userId, planId, percentBp, effectiveFrom })
    .onConflictDoUpdate({
      target: [commissionRates.planId, commissionRates.effectiveFrom],
      set: { percentBp },
    })
}

/** Removes a rate, but never the last one: a plan always needs a percentage. */
export async function deleteRate(db: Db, userId: string, planId: string, effectiveFrom: string) {
  const deleted = await db
    .delete(commissionRates)
    .where(
      and(
        eq(commissionRates.userId, userId),
        eq(commissionRates.planId, planId),
        eq(commissionRates.effectiveFrom, effectiveFrom),
        sql`(select count(*) from ${commissionRates} where ${commissionRates.planId} = ${planId}) > 1`,
      ),
    )
    .returning({ id: commissionRates.id })
  return deleted.length > 0
}

const activeEntriesOf = (userId: string, planId: string) =>
  and(
    eq(commissionEntries.userId, userId),
    eq(commissionEntries.planId, planId),
    isNull(commissionEntries.deletedAt),
  )

/** Entries by date and then in the order they were recorded; all of them without a range. */
export async function listEntries(
  db: Db,
  userId: string,
  planId: string,
  range?: { from: string; to: string },
) {
  const rows = await db
    .select()
    .from(commissionEntries)
    .where(
      and(
        activeEntriesOf(userId, planId),
        range ? between(commissionEntries.date, range.from, range.to) : undefined,
      ),
    )
    .orderBy(asc(commissionEntries.date), asc(commissionEntries.createdAt))
  return rows.map(toEntry)
}

export async function createEntry(
  db: Db,
  userId: string,
  planId: string,
  { note = '', ...input }: CommissionEntryInput,
) {
  const [row] = await db
    .insert(commissionEntries)
    .values({ ...input, note, userId, planId })
    .returning()
  if (!row) throw new Error('entry not created')
  return toEntry(row)
}

export async function updateEntry(
  db: Db,
  userId: string,
  entryId: string,
  update: CommissionEntryUpdate,
) {
  const [row] = await db
    .update(commissionEntries)
    .set(update)
    .where(
      and(
        eq(commissionEntries.userId, userId),
        eq(commissionEntries.id, entryId),
        isNull(commissionEntries.deletedAt),
      ),
    )
    .returning()
  return row ? toEntry(row) : null
}

/** Soft delete (plan §6.1), so that "Deshacer" can restore it. */
export async function deleteEntry(db: Db, userId: string, entryId: string) {
  const rows = await db
    .update(commissionEntries)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(commissionEntries.userId, userId),
        eq(commissionEntries.id, entryId),
        isNull(commissionEntries.deletedAt),
      ),
    )
    .returning({ id: commissionEntries.id })
  return rows.length > 0
}

export async function restoreEntry(db: Db, userId: string, entryId: string) {
  const [row] = await db
    .update(commissionEntries)
    .set({ deletedAt: null })
    .where(
      and(
        eq(commissionEntries.userId, userId),
        eq(commissionEntries.id, entryId),
        isNotNull(commissionEntries.deletedAt),
      ),
    )
    .returning()
  return row ? toEntry(row) : null
}

async function payoutsOf(db: Db, userId: string, planId: string) {
  const rows = await db
    .select()
    .from(commissionPayouts)
    .where(and(eq(commissionPayouts.userId, userId), eq(commissionPayouts.planId, planId)))
  return rows.map(toPayout)
}

/** Every week with entries or a payout, newest first. Days are added up in the database. */
export async function listWeeks(db: Db, userId: string, plan: CommissionPlan) {
  const days = await db
    .select({
      date: commissionEntries.date,
      amountCents: sql<number>`sum(${commissionEntries.amountCents})`.mapWith(Number),
    })
    .from(commissionEntries)
    .where(activeEntriesOf(userId, plan.id))
    .groupBy(commissionEntries.date)
  return summarizeWeeks(days, await payoutsOf(db, userId, plan.id), plan, plan.rates)
}

/**
 * Confirms the payout of the week paid on `payday` with what was actually paid, taking a snapshot of
 * the week's total, percentage and expected share. Confirming again replaces it.
 */
export async function upsertPayout(
  db: Db,
  userId: string,
  plan: CommissionPlan,
  payday: string,
  paidCents: number,
) {
  const week = commissionWeekByPayday(payday, plan)
  const [totals] = await db
    .select({
      grossCents: sql<number>`coalesce(sum(${commissionEntries.amountCents}), 0)`.mapWith(Number),
    })
    .from(commissionEntries)
    .where(
      and(activeEntriesOf(userId, plan.id), between(commissionEntries.date, week.start, week.end)),
    )
  const grossCents = totals?.grossCents ?? 0
  const percentBp = rateOn(plan.rates, payday)
  const snapshot = {
    grossCents,
    percentBp,
    expectedCents: expectedShareCents(grossCents, percentBp),
    paidCents,
    paidAt: sql`now()`,
  }
  const [row] = await db
    .insert(commissionPayouts)
    .values({ userId, planId: plan.id, payday, ...snapshot })
    .onConflictDoUpdate({
      target: [commissionPayouts.planId, commissionPayouts.payday],
      set: snapshot,
    })
    .returning()
  if (!row) throw new Error('payout not saved')
  return toPayout(row)
}

export async function deletePayout(db: Db, userId: string, planId: string, payday: string) {
  const rows = await db
    .delete(commissionPayouts)
    .where(
      and(
        eq(commissionPayouts.userId, userId),
        eq(commissionPayouts.planId, planId),
        eq(commissionPayouts.payday, payday),
      ),
    )
    .returning({ id: commissionPayouts.id })
  return rows.length > 0
}

/**
 * Adds imported rows, skipping those already recorded (same date, amount and note), as the
 * prototype does: each recorded entry absorbs one identical row, so a file with the same row twice
 * against one recorded entry adds one. Rows keep the file's order.
 */
export async function importEntries(
  db: Db,
  userId: string,
  planId: string,
  { rows }: CommissionImportInput,
) {
  const dates = rows.map(({ date }) => date).sort()
  const existing = await listEntries(db, userId, planId, {
    from: dates[0] ?? '',
    to: dates.at(-1) ?? '',
  })
  const key = (e: { date: string; amountCents: number; note: string }) =>
    `${e.date}|${e.amountCents}|${e.note}`
  const recorded = new Map<string, number>()
  for (const entry of existing) recorded.set(key(entry), (recorded.get(key(entry)) ?? 0) + 1)

  const added = rows.filter((row) => {
    const count = recorded.get(key(row)) ?? 0
    if (count === 0) return true
    recorded.set(key(row), count - 1)
    return false
  })
  if (added.length > 0) {
    // created_at grows a millisecond per row, so the entries of a day keep the file's order.
    const start = Date.now()
    await db
      .insert(commissionEntries)
      .values(added.map((row, i) => ({ ...row, userId, planId, createdAt: new Date(start + i) })))
  }
  return { added: added.length, skipped: rows.length - added.length }
}

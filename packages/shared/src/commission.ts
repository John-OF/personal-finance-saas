import { addDays, weekdayOf } from './dates'
import { applyPercentBp } from './money'

/**
 * Commission income (plan §2.2, §7.4): what the user makes each day adds up per pay week, and on
 * payday they are paid a percentage of the week's total.
 */

/** How a plan cuts weeks: they end on `periodEndWeekday` and are paid `paydayOffsetDays` later. */
export interface CommissionSchedule {
  /** 0 = Sunday … 6 = Saturday. */
  periodEndWeekday: number
  paydayOffsetDays: number
}

/** The two schedules of the prototype, both paid on Saturday. */
export const COMMISSION_SCHEDULES = {
  /** Sunday to Saturday, paid that Saturday. */
  sundayToSaturday: { periodEndWeekday: 6, paydayOffsetDays: 0 },
  /** Saturday to Friday, paid the next day (Saturday). */
  saturdayToFriday: { periodEndWeekday: 5, paydayOffsetDays: 1 },
} as const satisfies Record<string, CommissionSchedule>

export interface CommissionWeek {
  start: string
  end: string
  payday: string
}

/** The pay week a date belongs to. */
export function commissionWeekOf(date: string, schedule: CommissionSchedule): CommissionWeek {
  const end = addDays(date, (schedule.periodEndWeekday - weekdayOf(date) + 7) % 7)
  return { start: addDays(end, -6), end, payday: addDays(end, schedule.paydayOffsetDays) }
}

/** The pay week paid on `payday`, which must be a payday of the schedule (see isPayday). */
export function commissionWeekByPayday(payday: string, schedule: CommissionSchedule) {
  const end = addDays(payday, -schedule.paydayOffsetDays)
  return { start: addDays(end, -6), end, payday }
}

export function isPayday(date: string, schedule: CommissionSchedule) {
  return commissionWeekOf(addDays(date, -schedule.paydayOffsetDays), schedule).payday === date
}

/** The seven dates of a week, from start to end. */
export function weekDates(week: CommissionWeek) {
  return Array.from({ length: 7 }, (_, i) => addDays(week.start, i))
}

export interface CommissionRate {
  /** Basis points: 5000 = 50%. */
  percentBp: number
  /** First payday the rate applies to. */
  effectiveFrom: string
}

/**
 * The percentage paid on `payday`: the latest rate that started on or before it, so changing the
 * percentage never rewrites past weeks. Weeks before the first rate (e.g. imported history) use the
 * first one. A plan always has at least one rate.
 */
export function rateOn(rates: readonly CommissionRate[], payday: string): number {
  const sorted = [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  let chosen = sorted[0]
  if (!chosen) throw new Error('a commission plan needs at least one rate')
  for (const rate of sorted) if (rate.effectiveFrom <= payday) chosen = rate
  return chosen.percentBp
}

/** What the user is owed for a week: the percentage of the weekly total, rounded once (plan §7.4). */
export function expectedShareCents(grossCents: number, percentBp: number) {
  return applyPercentBp(grossCents, percentBp)
}

/** A confirmed payment, with the figures as they were when it was confirmed. */
export interface CommissionPayout {
  payday: string
  grossCents: number
  percentBp: number
  expectedCents: number
  paidCents: number
  /** ISO timestamp. */
  paidAt: string
}

export interface DailyTotal {
  date: string
  amountCents: number
}

export interface CommissionWeekSummary extends CommissionWeek {
  grossCents: number
  /** Days with at least one entry. */
  daysWorked: number
  /** The rate that applies on payday, and the share it gives today. */
  percentBp: number
  expectedCents: number
  payout: CommissionPayout | null
}

/** A week with nothing recorded, e.g. the current one on Monday morning. */
export function emptyWeekSummary(
  payday: string,
  schedule: CommissionSchedule,
  rates: readonly CommissionRate[],
): CommissionWeekSummary {
  return {
    ...commissionWeekByPayday(payday, schedule),
    grossCents: 0,
    daysWorked: 0,
    percentBp: rateOn(rates, payday),
    expectedCents: 0,
    payout: null,
  }
}

/**
 * Groups daily totals into pay weeks, newest first. Weeks with a payout but no entries are kept
 * (e.g. after changing the schedule), and so are payouts whose week has no entries left.
 */
export function summarizeWeeks(
  days: readonly DailyTotal[],
  payouts: readonly CommissionPayout[],
  schedule: CommissionSchedule,
  rates: readonly CommissionRate[],
): CommissionWeekSummary[] {
  const weeks = new Map<string, CommissionWeekSummary>()
  const weekFor = (payday: string) => {
    let week = weeks.get(payday)
    if (!week) {
      week = emptyWeekSummary(payday, schedule, rates)
      weeks.set(payday, week)
    }
    return week
  }

  for (const { date, amountCents } of days) {
    if (amountCents <= 0) continue
    const week = weekFor(commissionWeekOf(date, schedule).payday)
    week.grossCents += amountCents
    week.daysWorked += 1
  }
  for (const payout of payouts) weekFor(payout.payday).payout = payout
  for (const week of weeks.values()) {
    week.expectedCents = expectedShareCents(week.grossCents, week.percentBp)
  }
  return [...weeks.values()].sort((a, b) => b.payday.localeCompare(a.payday))
}

/** Weeks with entries that were never marked as paid, paid on or before `through`. */
export function unconfirmedWeeks(weeks: readonly CommissionWeekSummary[], through: string) {
  return weeks.filter((week) => !week.payout && week.grossCents > 0 && week.payday <= through)
}

/** What the week counts for: what was actually paid, or else what is expected. */
export function weekShareCents(week: CommissionWeekSummary) {
  return week.payout ? week.payout.paidCents : week.expectedCents
}

/** The history's year line: share, days worked and share per day for weeks paid in `year`. */
export function yearSummary(weeks: readonly CommissionWeekSummary[], year: string) {
  let shareCents = 0
  let daysWorked = 0
  for (const week of weeks) {
    if (!week.payday.startsWith(`${year}-`)) continue
    shareCents += weekShareCents(week)
    daysWorked += week.daysWorked
  }
  return {
    shareCents,
    daysWorked,
    perDayCents: daysWorked > 0 ? Math.round(shareCents / daysWorked) : 0,
  }
}

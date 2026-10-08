import { z } from 'zod'

/**
 * Business dates are `YYYY-MM-DD` strings (plan §7.2): the day the user sees, with no time and no
 * time-zone surprises. Arithmetic goes through UTC midnights, which have no daylight-saving gaps.
 */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

function toUtcMs(date: string) {
  const [, y, m, d] = DATE_KEY.exec(date) ?? []
  return Date.UTC(Number(y), Number(m) - 1, Number(d))
}

function fromUtcMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

/** A real calendar date written as `YYYY-MM-DD` (rejects 2026-02-30). */
export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_KEY.test(value) && fromUtcMs(toUtcMs(value)) === value
}

export function addDays(date: string, days: number) {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS)
}

/** Days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string) {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS)
}

/** 0 = Sunday … 6 = Saturday, as in JavaScript and Postgres' `extract(dow)`. */
export function weekdayOf(date: string) {
  return new Date(toUtcMs(date)).getUTCDay()
}

/** Today's date in a time zone (the user's, from their profile), not the device's or the server's. */
export function todayIn(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export const dateKeySchema = z.string().refine(isDateKey, { error: 'Elige una fecha válida.' })

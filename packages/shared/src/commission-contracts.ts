import { z } from 'zod'
import type { CommissionRate, CommissionWeekSummary } from './commission'
import { COMMISSION_NOTE_MAX_LENGTH } from './commission-csv'
import { dateKeySchema } from './dates'
import { FULL_PERCENT_BP, MAX_AMOUNT_CENTS, parseAmountToCents } from './money'

/** Request and response shapes of `/api/v1/commission` (plan §8). */

export const COMMISSION_PLAN_NAME_MAX_LENGTH = 60
/** Rows per import request: the client splits bigger files (the API takes 64 KB bodies). */
export const COMMISSION_IMPORT_BATCH = 250

/** Percentages are typed like amounts (`50`, `37,5`) and stored in basis points. */
export function parsePercentToBp(raw: string) {
  const bp = parseAmountToCents(raw)
  return bp !== null && bp >= 1 && bp <= FULL_PERCENT_BP ? bp : null
}

const percentBpSchema = z
  .int()
  .min(1, { error: 'Escribe un porcentaje entre 0,01 y 100.' })
  .max(FULL_PERCENT_BP, { error: 'Escribe un porcentaje entre 0,01 y 100.' })

const weekdaySchema = z.int().min(0).max(6)

const planFields = {
  name: z
    .string()
    .trim()
    .min(1, { error: 'Ponle un nombre.' })
    .max(COMMISSION_PLAN_NAME_MAX_LENGTH, {
      error: `Usa como mucho ${COMMISSION_PLAN_NAME_MAX_LENGTH} caracteres.`,
    }),
  periodEndWeekday: weekdaySchema,
  paydayOffsetDays: z.int().min(0).max(6),
}

export const commissionPlanInputSchema = z.strictObject({
  ...planFields,
  percentBp: percentBpSchema,
})
export type CommissionPlanInput = z.infer<typeof commissionPlanInputSchema>

/**
 * Name, schedule and where payouts are recorded as income (an account and an income category, or
 * null for both to stop). The percentage changes through rates, which keep past weeks as they were.
 */
export const commissionPlanUpdateSchema = z
  .strictObject({
    name: planFields.name.optional(),
    periodEndWeekday: planFields.periodEndWeekday.optional(),
    paydayOffsetDays: planFields.paydayOffsetDays.optional(),
    accountId: z.uuid({ error: 'Elige una cuenta.' }).nullable().optional(),
    categoryId: z.uuid({ error: 'Elige una categoría.' }).nullable().optional(),
  })
  .refine((update) => Object.keys(update).length > 0, { error: 'No hay nada que guardar.' })
  .refine(({ accountId, categoryId }) => (accountId === undefined) === (categoryId === undefined), {
    error: 'Indica la cuenta y la categoría juntas.',
  })
  .refine(({ accountId, categoryId }) => (accountId === null) === (categoryId === null), {
    error: 'Elige una cuenta y una categoría, o ninguna de las dos.',
    path: ['categoryId'],
  })
export type CommissionPlanUpdate = z.infer<typeof commissionPlanUpdateSchema>

/** A new percentage from a payday on; replaces the one starting that same day, if any. */
export const commissionRateInputSchema = z.strictObject({
  percentBp: percentBpSchema,
  effectiveFrom: dateKeySchema,
})
export type CommissionRateInput = z.infer<typeof commissionRateInputSchema>

const amountCentsSchema = z
  .int()
  .min(1, { error: 'Escribe cuánto hiciste, por ejemplo 25.' })
  .max(MAX_AMOUNT_CENTS, { error: 'Ese monto es demasiado grande.' })

const noteSchema = z
  .string()
  .trim()
  .max(COMMISSION_NOTE_MAX_LENGTH, {
    error: `Usa como mucho ${COMMISSION_NOTE_MAX_LENGTH} caracteres.`,
  })

export const commissionEntryInputSchema = z.strictObject({
  date: dateKeySchema,
  amountCents: amountCentsSchema,
  note: noteSchema.optional(),
})
export type CommissionEntryInput = z.infer<typeof commissionEntryInputSchema>

export const commissionEntryUpdateSchema = z
  .strictObject({
    date: dateKeySchema.optional(),
    amountCents: amountCentsSchema.optional(),
    note: noteSchema.optional(),
  })
  .refine((update) => Object.keys(update).length > 0, { error: 'No hay nada que guardar.' })
export type CommissionEntryUpdate = z.infer<typeof commissionEntryUpdateSchema>

/** `GET entries`: one range (both ends, at most 62 days), or every entry when there is none. */
export const commissionEntriesQuerySchema = z
  .strictObject({ from: dateKeySchema.optional(), to: dateKeySchema.optional() })
  .refine(({ from, to }) => (from === undefined) === (to === undefined), {
    error: 'Indica las dos fechas del rango o ninguna.',
  })
  .refine(({ from, to }) => !from || !to || (from <= to && rangeDays(from, to) <= 62), {
    error: 'El rango debe ir hacia adelante y abarcar como mucho 62 días.',
  })

function rangeDays(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

/** Confirming a payout with what was actually paid (it may differ from the expected share). */
export const commissionPayoutInputSchema = z.strictObject({
  paidCents: z
    .int()
    .min(0, { error: 'Escribe cuánto te pagaron, por ejemplo 35.' })
    .max(MAX_AMOUNT_CENTS, { error: 'Ese monto es demasiado grande.' }),
})
export type CommissionPayoutInput = z.infer<typeof commissionPayoutInputSchema>

/**
 * Marks as paid, with the expected share, every week with entries and no payout whose payday is on
 * or before `through`: after importing the prototype's CSV, whose payouts are not in the file.
 */
export const commissionBulkPayoutInputSchema = z.strictObject({ through: dateKeySchema })
export type CommissionBulkPayoutInput = z.infer<typeof commissionBulkPayoutInputSchema>

export interface CommissionBulkPayoutResponse {
  confirmed: number
  /** What the weeks marked add up to. */
  paidCents: number
}

export const commissionImportInputSchema = z.strictObject({
  rows: z
    .array(
      z.strictObject({
        date: dateKeySchema,
        amountCents: amountCentsSchema,
        note: noteSchema,
      }),
    )
    .min(1)
    .max(COMMISSION_IMPORT_BATCH),
})
export type CommissionImportInput = z.infer<typeof commissionImportInputSchema>

export interface CommissionPlan {
  id: string
  name: string
  periodEndWeekday: number
  paydayOffsetDays: number
  /** Where a confirmed payout is recorded as income; null for both when it is not. */
  accountId: string | null
  categoryId: string | null
  /** Oldest first. */
  rates: CommissionRate[]
}

export interface CommissionPlansResponse {
  plans: CommissionPlan[]
}

export interface CommissionEntry {
  id: string
  date: string
  amountCents: number
  note: string
  /** ISO timestamp; orders the entries of a day. */
  createdAt: string
}

export interface CommissionEntriesResponse {
  /** By date, then in the order they were recorded. */
  entries: CommissionEntry[]
}

export interface CommissionWeeksResponse {
  /** Every week with entries or a payout, newest first. */
  weeks: CommissionWeekSummary[]
}

export interface CommissionImportResponse {
  added: number
  /** Rows already recorded (same date, amount and note), not added again. */
  skipped: number
}

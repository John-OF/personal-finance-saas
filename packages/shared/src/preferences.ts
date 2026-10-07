import { z } from 'zod'

/** Themes in apps/web/src/styles/themes.css (labels live in the web app). */
export const THEME_IDS = ['libreta', 'cobalto', 'malva', 'neutro', 'contraste'] as const
export type ThemeId = (typeof THEME_IDS)[number]

export const THEME_MODES = ['system', 'light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const themePreferenceSchema = z.strictObject({
  theme: z.enum(THEME_IDS),
  mode: z.enum(THEME_MODES),
})
export type ThemePreference = z.infer<typeof themePreferenceSchema>

/**
 * Modules a user can turn on or off (plan §3). `finances` groups accounts, transactions, scheduled
 * items and the summary; the others group the rest of the plan's sections.
 */
export const MODULE_IDS = [
  'finances',
  'commission',
  'debts',
  'savings',
  'budgets',
  'planning',
] as const
export type ModuleId = (typeof MODULE_IDS)[number]

function supported(kind: 'currency' | 'timeZone') {
  return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf(kind) : null
}

/** ISO 4217 code known to the runtime's Intl data. */
export function isCurrencyCode(value: string) {
  if (!/^[A-Z]{3}$/.test(value)) return false
  return supported('currency')?.includes(value) ?? true
}

/** IANA time zone the runtime can format dates in (aliases included). */
export function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

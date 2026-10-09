/**
 * Money is always an integer number of cents. Floats only appear when formatting for display.
 */

/** 999.999.999,99 — guards against typos and overflow. */
export const MAX_AMOUNT_CENTS = 99_999_999_999

/** 100% expressed in basis points. */
export const FULL_PERCENT_BP = 10_000

/**
 * Parses what a person types into cents. Accepts 25 · 25,5 · 25.50 · 1.500 · 1,500.50 · 1.500,50.
 * The last separator is decimal unless it is followed by exactly three digits (thousands) or none.
 * Extra decimals are rounded half up. Returns null when there is no number.
 */
export function parseAmountToCents(raw: string): number | null {
  let s = raw.replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (!/\d/.test(s)) return null

  const negative = s.startsWith('-')
  s = s.replace(/-/g, '')

  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  let intPart = s
  let decPart = ''
  if (last !== -1) {
    const decimals = s.length - last - 1
    if (decimals === 3 || decimals === 0) {
      intPart = s.replace(/[.,]/g, '')
    } else {
      intPart = s.slice(0, last).replace(/[.,]/g, '')
      decPart = s.slice(last + 1)
    }
  }

  const units = intPart === '' ? 0 : Number(intPart)
  const firstTwo = Number(decPart.slice(0, 2).padEnd(2, '0'))
  const roundUp = Number(decPart.charAt(2) || '0') >= 5 ? 1 : 0
  const cents = units * 100 + firstTwo + roundUp

  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

/** Applies a percentage in basis points (5000 = 50%), rounding half away from zero. */
export function applyPercentBp(cents: number, percentBp: number): number {
  const sign = cents < 0 ? -1 : 1
  return sign * Math.floor((Math.abs(cents) * percentBp + FULL_PERCENT_BP / 2) / FULL_PERCENT_BP)
}

export interface MoneyFormatOptions {
  currency?: string
  locale?: string
  /** `$25` instead of `$25,00` when there are no cents, as the commission prototype shows. */
  trimZeroCents?: boolean
}

export function formatMoney(
  cents: number,
  { currency = 'USD', locale = 'es-EC', trimZeroCents = false }: MoneyFormatOptions = {},
): string {
  const whole = trimZeroCents && cents % 100 === 0
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...(whole && { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  }).format(cents / 100)
}

/** The currency's symbol in a locale, such as `$` or `€`, for amount inputs. */
export function currencySymbol(currency: string, locale: string) {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0)
  return parts.find(({ type }) => type === 'currency')?.value ?? currency
}

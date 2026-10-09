import { currencySymbol, formatMoney } from '@pf/shared'
import { useMemo } from 'react'
import { useMe } from '../app/me-context'

/**
 * Amounts in the user's currency and locale, as the prototypes show them: `$25` without cents,
 * `$25,50` with them, and `−$300` for a debt (es-EC alone would print `$-300`). `signed` adds the
 * sign of a movement: `+$25`, `−$25`.
 */
export function useMoney() {
  const { currency, locale } = useMe().me.profile
  return useMemo(() => {
    const unsigned = (cents: number) =>
      formatMoney(Math.abs(cents), { currency, locale, trimZeroCents: true })
    return {
      money: (cents: number) => `${cents < 0 ? '−' : ''}${unsigned(cents)}`,
      signed: (cents: number, sign: 1 | -1) => `${sign > 0 ? '+' : '−'}${unsigned(cents)}`,
      symbol: currencySymbol(currency, locale),
      locale,
    }
  }, [currency, locale])
}

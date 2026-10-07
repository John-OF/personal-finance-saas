// Choices for currency, time zone and first day of the week. Names come from the browser's Intl
// data, in Spanish.

/** The currencies most likely to be used; any other valid code the profile has is added on top. */
const COMMON_CURRENCIES = [
  'USD',
  'EUR',
  'MXN',
  'COP',
  'PEN',
  'CLP',
  'ARS',
  'BOB',
  'PYG',
  'UYU',
  'VES',
  'GTQ',
  'HNL',
  'NIO',
  'CRC',
  'DOP',
  'BRL',
  'CAD',
  'GBP',
]

export function currencyOptions(current: string) {
  const names = new Intl.DisplayNames(['es'], { type: 'currency' })
  const codes = COMMON_CURRENCIES.includes(current)
    ? COMMON_CURRENCIES
    : [current, ...COMMON_CURRENCIES]
  return codes.map((code) => ({ value: code, label: `${names.of(code) ?? code} (${code})` }))
}

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Time zones grouped by region (América, Europa…), with the current one always present. */
export function timeZoneGroups(current: string) {
  const all = Intl.supportedValuesOf('timeZone')
  const zones = all.includes(current) ? all : [current, ...all]
  const groups = new Map<string, { value: string; label: string }[]>()
  for (const zone of zones) {
    const [region = zone, ...rest] = zone.split('/')
    const place = rest.length > 0 ? rest.join(' / ') : region
    const list = groups.get(region) ?? []
    list.push({ value: zone, label: place.replaceAll('_', ' ') })
    groups.set(region, list)
  }
  return [...groups].map(([region, options]) => ({ region, options }))
}

/** ISO weekdays offered as the first day of the week. */
export const WEEK_STARTS = [
  { value: 1, label: 'Lunes' },
  { value: 7, label: 'Domingo' },
  { value: 6, label: 'Sábado' },
]

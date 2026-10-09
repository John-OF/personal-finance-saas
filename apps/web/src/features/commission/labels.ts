import { weekdayOf, type CommissionWeek } from '@pf/shared'

// Dates as the prototype words them ("lunes 6", "6 oct", "6 de octubre"). Business dates are
// YYYY-MM-DD strings, read without going through Date so no time zone can move them.

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DAY_INITIALS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']
const DAY_ABBREVIATIONS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
const MONTH_ABBREVIATIONS = MONTHS.map((month) => month.slice(0, 3))

const day = (date: string) => Number(date.slice(8, 10))
const month = (date: string) => Number(date.slice(5, 7)) - 1
const year = (date: string) => date.slice(0, 4)

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** 0 = Sunday … 6 = Saturday. */
export const weekdayName = (weekday: number) => DAY_NAMES[weekday] ?? ''
export const dayName = (date: string) => weekdayName(weekdayOf(date))
export const dayInitials = (date: string) => DAY_INITIALS[weekdayOf(date)] ?? ''
export const dayAbbreviation = (date: string) => DAY_ABBREVIATIONS[weekdayOf(date)] ?? ''
export const dayNumber = (date: string) => String(day(date))

/** "lunes 6" */
export const dayLabel = (date: string) => `${dayName(date)} ${day(date)}`
/** "6 oct" */
export const shortDate = (date: string) => `${day(date)} ${MONTH_ABBREVIATIONS[month(date)]}`
/** "6 de octubre" */
export const longDate = (date: string) => `${day(date)} de ${MONTHS[month(date)]}`
/** "Octubre 2026", from a date or a YYYY-MM month. */
export const monthLabel = (date: string) => `${capitalize(MONTHS[month(date)] ?? '')} ${year(date)}`

/** `2550` → `25,5`: an amount ready to edit in the user's locale, without grouping. */
export function amountText(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { useGrouping: false, maximumFractionDigits: 2 })
}

/** "4 – 10 oct", "28 sep – 4 oct", with the year when it is not the current one. */
export function rangeLabel(week: CommissionWeek, today: string) {
  const suffix = year(week.end) === year(today) ? '' : ` ${year(week.end)}`
  const end = `${day(week.end)} ${MONTH_ABBREVIATIONS[month(week.end)]}${suffix}`
  return month(week.start) === month(week.end)
    ? `${day(week.start)} – ${end}`
    : `${shortDate(week.start)} – ${end}`
}

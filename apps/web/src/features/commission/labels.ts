import type { CommissionWeek } from '@pf/shared'
import { day, month, MONTH_ABBREVIATIONS, shortDate, year } from '../../lib/labels'

/** "4 – 10 oct", "28 sep – 4 oct", with the year when it is not the current one. */
export function rangeLabel(week: CommissionWeek, today: string) {
  const suffix = year(week.end) === year(today) ? '' : ` ${year(week.end)}`
  const end = `${day(week.end)} ${MONTH_ABBREVIATIONS[month(week.end)]}${suffix}`
  return month(week.start) === month(week.end)
    ? `${day(week.start)} – ${end}`
    : `${shortDate(week.start)} – ${end}`
}

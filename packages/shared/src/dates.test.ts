import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  daysBetween,
  isDateKey,
  isMonthKey,
  monthOf,
  monthRange,
  todayIn,
  weekdayOf,
} from './dates'

describe('isDateKey', () => {
  it.each(['2026-10-08', '2024-02-29', '2000-01-01'])('accepts %s', (value) => {
    expect(isDateKey(value)).toBe(true)
  })

  it.each([
    '2026-02-29',
    '2026-13-01',
    '2026-1-8',
    '08/10/2026',
    '2026-10-08T00:00',
    '',
    null,
    20261008,
  ])('rejects %s', (value) => {
    expect(isDateKey(value)).toBe(false)
  })
})

describe('addDays and daysBetween', () => {
  it('crosses month and year ends, and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
    expect(daysBetween('2026-10-08', '2026-10-01')).toBe(-7)
  })

  it('is not moved by daylight-saving changes', () => {
    // Clocks change on these days in many countries; dates must still advance one by one.
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })
})

describe('weekdayOf', () => {
  it('numbers the days from Sunday', () => {
    expect(weekdayOf('2026-10-04')).toBe(0)
    expect(weekdayOf('2026-10-10')).toBe(6)
  })
})

describe('todayIn', () => {
  it('uses the given time zone, not the machine one', () => {
    // 02:00 UTC on the 9th is still the 8th in Ecuador (UTC-5).
    const now = new Date('2026-10-09T02:00:00Z')
    expect(todayIn('America/Guayaquil', now)).toBe('2026-10-08')
    expect(todayIn('Europe/Madrid', now)).toBe('2026-10-09')
  })
})

describe('months', () => {
  it.each(['2026-10', '2026-01', '2026-12'])('accepts %s', (value) => {
    expect(isMonthKey(value)).toBe(true)
  })

  it.each(['2026-13', '2026-00', '2026-1', '2026-10-01', '', null])('rejects %s', (value) => {
    expect(isMonthKey(value)).toBe(false)
  })

  it('moves across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', -22)).toBe('2024-12')
    expect(monthOf('2026-10-08')).toBe('2026-10')
  })

  it('knows the last day of each month, leap years included', () => {
    expect(monthRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

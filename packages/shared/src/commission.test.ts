import { describe, expect, it } from 'vitest'
import {
  COMMISSION_SCHEDULES,
  commissionWeekByPayday,
  commissionWeekOf,
  isPayday,
  rateOn,
  summarizeWeeks,
  unconfirmedWeeks,
  weekDates,
  yearSummary,
  type CommissionPayout,
} from './commission'
import { addDays } from './dates'

const { sundayToSaturday, saturdayToFriday } = COMMISSION_SCHEDULES

/** weekOf from docs/mis-ingresos.html, kept as the reference the app must agree with. */
function prototypeWeekOf(k: string, satCounts: boolean) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const fromKey = (key: string) => {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number]
    return new Date(y, m - 1, d, 12)
  }
  const add = (key: string, n: number) => {
    const d = fromKey(key)
    d.setDate(d.getDate() + n)
    return toKey(d)
  }
  const dow = (key: string) => fromKey(key).getDay()
  const start = add(k, -(satCounts ? dow(k) : (dow(k) + 1) % 7))
  const end = add(start, 6)
  return { start, end, payday: satCounts ? end : add(end, 1) }
}

describe('commissionWeekOf', () => {
  it('matches the prototype in both of its modes, day after day', () => {
    for (let i = 0; i < 800; i++) {
      const date = addDays('2025-12-20', i)
      expect(commissionWeekOf(date, sundayToSaturday)).toEqual(prototypeWeekOf(date, true))
      expect(commissionWeekOf(date, saturdayToFriday)).toEqual(prototypeWeekOf(date, false))
    }
  })

  it('pays a Saturday that same day from Sunday to Saturday', () => {
    expect(commissionWeekOf('2026-10-10', sundayToSaturday)).toEqual({
      start: '2026-10-04',
      end: '2026-10-10',
      payday: '2026-10-10',
    })
  })

  it('pays a Saturday the next Saturday from Saturday to Friday', () => {
    expect(commissionWeekOf('2026-10-10', saturdayToFriday).payday).toBe('2026-10-17')
    expect(commissionWeekOf('2026-10-09', saturdayToFriday).payday).toBe('2026-10-10')
  })

  it('handles other paydays and longer delays', () => {
    // Week ending on Wednesday, paid on Friday.
    const schedule = { periodEndWeekday: 3, paydayOffsetDays: 2 }
    expect(commissionWeekOf('2026-10-08', schedule)).toEqual({
      start: '2026-10-08',
      end: '2026-10-14',
      payday: '2026-10-16',
    })
  })
})

describe('commissionWeekByPayday and isPayday', () => {
  it('finds the week back from its payday', () => {
    for (const schedule of [sundayToSaturday, saturdayToFriday]) {
      const week = commissionWeekOf('2026-10-07', schedule)
      expect(commissionWeekByPayday(week.payday, schedule)).toEqual(week)
      expect(isPayday(week.payday, schedule)).toBe(true)
      expect(isPayday(addDays(week.payday, 1), schedule)).toBe(false)
    }
  })

  it('lists the seven dates of the week', () => {
    const dates = weekDates(commissionWeekOf('2026-10-07', sundayToSaturday))
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe('2026-10-04')
    expect(dates[6]).toBe('2026-10-10')
  })
})

describe('rateOn', () => {
  const rates = [
    { percentBp: 6000, effectiveFrom: '2026-10-17' },
    { percentBp: 5000, effectiveFrom: '2026-06-01' },
  ]

  it('uses the latest rate started on or before payday, whatever the order given', () => {
    expect(rateOn(rates, '2026-10-10')).toBe(5000)
    expect(rateOn(rates, '2026-10-17')).toBe(6000)
    expect(rateOn(rates, '2027-01-02')).toBe(6000)
  })

  it('uses the first rate for weeks before it', () => {
    expect(rateOn(rates, '2026-01-03')).toBe(5000)
  })

  it('needs at least one rate', () => {
    expect(() => rateOn([], '2026-10-10')).toThrow()
  })
})

describe('summarizeWeeks', () => {
  const rates = [{ percentBp: 5000, effectiveFrom: '2026-01-01' }]
  const payout: CommissionPayout = {
    payday: '2026-09-26',
    grossCents: 1000,
    percentBp: 5000,
    expectedCents: 500,
    paidCents: 480,
    paidAt: '2026-09-26T20:00:00.000Z',
  }

  it('adds up each week, newest first, and rounds the share once per week', () => {
    const weeks = summarizeWeeks(
      [
        { date: '2026-10-05', amountCents: 125 },
        { date: '2026-10-06', amountCents: 125 },
        { date: '2026-10-01', amountCents: 2000 },
      ],
      [],
      sundayToSaturday,
      rates,
    )
    expect(
      weeks.map(({ payday, grossCents, daysWorked, expectedCents }) => ({
        payday,
        grossCents,
        daysWorked,
        expectedCents,
      })),
    ).toEqual([
      // 50% of 2.50 is 1.25; rounding each day (0.63 + 0.63) would give 1.26.
      { payday: '2026-10-10', grossCents: 250, daysWorked: 2, expectedCents: 125 },
      { payday: '2026-10-03', grossCents: 2000, daysWorked: 1, expectedCents: 1000 },
    ])
  })

  it('keeps payouts, including for weeks with no entries left', () => {
    const weeks = summarizeWeeks([], [payout], sundayToSaturday, rates)
    expect(weeks).toHaveLength(1)
    expect(weeks[0]).toMatchObject({ payday: '2026-09-26', grossCents: 0, payout })
  })

  it('applies the rate in force on each payday', () => {
    const weeks = summarizeWeeks(
      [
        { date: '2026-10-05', amountCents: 1000 },
        { date: '2026-10-12', amountCents: 1000 },
      ],
      [],
      sundayToSaturday,
      [...rates, { percentBp: 6000, effectiveFrom: '2026-10-17' }],
    )
    expect(weeks.map(({ percentBp, expectedCents }) => [percentBp, expectedCents])).toEqual([
      [6000, 600],
      [5000, 500],
    ])
  })
})

describe('unconfirmedWeeks', () => {
  it('keeps the weeks with entries and no payout, up to a payday', () => {
    const weeks = summarizeWeeks(
      [
        { date: '2026-09-21', amountCents: 1000 },
        { date: '2026-09-28', amountCents: 1000 },
        { date: '2026-10-05', amountCents: 1000 },
      ],
      [
        {
          payday: '2026-10-03',
          grossCents: 1000,
          percentBp: 5000,
          expectedCents: 500,
          paidCents: 500,
          paidAt: '2026-10-03T20:00:00.000Z',
        },
        // A payout for a week whose entries were deleted afterwards.
        {
          payday: '2026-09-19',
          grossCents: 0,
          percentBp: 5000,
          expectedCents: 0,
          paidCents: 0,
          paidAt: '2026-09-19T20:00:00.000Z',
        },
      ],
      sundayToSaturday,
      [{ percentBp: 5000, effectiveFrom: '2026-01-01' }],
    )
    expect(unconfirmedWeeks(weeks, '2026-10-03').map(({ payday }) => payday)).toEqual([
      '2026-09-26',
    ])
    expect(unconfirmedWeeks(weeks, '2026-10-10').map(({ payday }) => payday)).toEqual([
      '2026-10-10',
      '2026-09-26',
    ])
  })
})

describe('yearSummary', () => {
  it('counts what was paid when there is a payout, and the expected share otherwise', () => {
    const weeks = summarizeWeeks(
      [
        { date: '2026-09-21', amountCents: 1000 },
        { date: '2026-09-22', amountCents: 1000 },
        { date: '2026-10-05', amountCents: 1001 },
        // Paid on Saturday 2025-12-20. (Monday 2025-12-29 would be paid on 2026-01-03, in 2026.)
        { date: '2025-12-20', amountCents: 9999 },
      ],
      [
        {
          payday: '2026-09-26',
          grossCents: 2000,
          percentBp: 5000,
          expectedCents: 1000,
          paidCents: 900,
          paidAt: '2026-09-26T20:00:00.000Z',
        },
      ],
      sundayToSaturday,
      [{ percentBp: 5000, effectiveFrom: '2026-01-01' }],
    )
    // 9.00 paid + 5.01 expected (5.005 rounded up), over three days; 2025's week is left out.
    expect(yearSummary(weeks, '2026')).toEqual({
      shareCents: 1401,
      daysWorked: 3,
      perDayCents: 467,
    })
    expect(yearSummary(weeks, '2024')).toEqual({ shareCents: 0, daysWorked: 0, perDayCents: 0 })
  })
})

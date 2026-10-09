import { describe, expect, it } from 'vitest'
import { applyPercentBp, currencySymbol, formatMoney, parseAmountToCents } from './money'

describe('parseAmountToCents', () => {
  it.each([
    ['25', 2500],
    ['25,5', 2550],
    ['25.50', 2550],
    ['1.500', 150000],
    ['1,500', 150000],
    ['1,500.50', 150050],
    ['1.500,50', 150050],
    ['25.', 2500],
    ['.5', 50],
    ['$ 1 200,75', 120075],
    ['0,1', 10],
    ['1.2345', 123],
    ['9.9951', 1000],
    ['0.125', 12500],
    ['-12,30', -1230],
  ])('parses %s as %i cents', (raw, cents) => {
    expect(parseAmountToCents(raw)).toBe(cents)
  })

  it.each(['', 'abc', '$', '-'])('returns null for %j', (raw) => {
    expect(parseAmountToCents(raw)).toBeNull()
  })

  it('returns null when the amount is not a safe integer of cents', () => {
    expect(parseAmountToCents('9'.repeat(20))).toBeNull()
  })
})

describe('applyPercentBp', () => {
  it('takes half of a weekly total', () => {
    expect(applyPercentBp(20000, 5000)).toBe(10000)
  })

  it('rounds half up at the cent', () => {
    expect(applyPercentBp(1, 5000)).toBe(1)
    expect(applyPercentBp(333, 5000)).toBe(167)
    expect(applyPercentBp(3333, 3333)).toBe(1111)
  })

  it('rounds negative amounts away from zero', () => {
    expect(applyPercentBp(-333, 5000)).toBe(-167)
  })
})

describe('formatMoney', () => {
  it('formats cents as currency for es-EC by default', () => {
    expect(formatMoney(1500050)).toMatch(/15\.000,50/)
  })

  it('can leave out zero cents, and only zero cents', () => {
    expect(formatMoney(2500, { trimZeroCents: true })).toMatch(/^\$\s?25$/)
    expect(formatMoney(2550, { trimZeroCents: true })).toMatch(/25,50$/)
    expect(formatMoney(-2500, { trimZeroCents: true })).toMatch(/25$/)
  })
})

describe('currencySymbol', () => {
  it('gives the symbol used in the locale', () => {
    expect(currencySymbol('USD', 'es-EC')).toBe('$')
    expect(currencySymbol('EUR', 'es-ES')).toBe('€')
  })
})

import { describe, expect, it } from 'vitest'
import { netWorthCents, savingsRateBp } from './finance'
import { transactionInputSchema } from './finance-contracts'
import { formErrors } from './validation'

const ACCOUNT = '00000000-0000-4000-8000-0000000000a1'
const OTHER_ACCOUNT = '00000000-0000-4000-8000-0000000000a2'
const CATEGORY = '00000000-0000-4000-8000-0000000000c1'

describe('netWorthCents', () => {
  it('adds the open accounts counted in it, cards in debt subtracting', () => {
    expect(
      netWorthCents([
        { balanceCents: 150_000, includeInNetWorth: true, archived: false },
        { balanceCents: -40_000, includeInNetWorth: true, archived: false },
        { balanceCents: 99_999, includeInNetWorth: false, archived: false },
        { balanceCents: 5_000, includeInNetWorth: true, archived: true },
      ]),
    ).toBe(110_000)
  })

  it('is zero without accounts', () => {
    expect(netWorthCents([])).toBe(0)
  })
})

describe('savingsRateBp', () => {
  it('is the share of income not spent', () => {
    expect(savingsRateBp(100_000, 75_000)).toBe(2500)
    expect(savingsRateBp(30_000, 10_000)).toBe(6667)
  })

  it('goes negative when spending more than what came in', () => {
    expect(savingsRateBp(100_000, 150_000)).toBe(-5000)
  })

  it('means nothing without income', () => {
    expect(savingsRateBp(0, 5_000)).toBeNull()
  })
})

describe('transactionInputSchema', () => {
  const base = { date: '2026-10-08', amountCents: 2550, accountId: ACCOUNT }

  it('takes income and expenses with a category', () => {
    for (const kind of ['income', 'expense'] as const) {
      expect(transactionInputSchema.parse({ ...base, kind, categoryId: CATEGORY })).toEqual({
        ...base,
        kind,
        categoryId: CATEGORY,
      })
    }
  })

  it('takes a transfer to another account', () => {
    const transfer = { ...base, kind: 'transfer', toAccountId: OTHER_ACCOUNT, note: ' Ahorro ' }
    expect(transactionInputSchema.parse(transfer)).toEqual({ ...transfer, note: 'Ahorro' })
  })

  it('asks for a category on income and expenses', () => {
    expect(formErrors(transactionInputSchema, { ...base, kind: 'expense' })).toEqual({
      categoryId: ['Elige una categoría.'],
    })
  })

  it('rejects a transfer to the same account', () => {
    expect(
      formErrors(transactionInputSchema, { ...base, kind: 'transfer', toAccountId: ACCOUNT }),
    ).toEqual({ toAccountId: ['Elige dos cuentas distintas.'] })
  })

  it.each([
    [
      'a category on a transfer',
      { kind: 'transfer', toAccountId: OTHER_ACCOUNT, categoryId: CATEGORY },
    ],
    [
      'a destination on an expense',
      { kind: 'expense', categoryId: CATEGORY, toAccountId: OTHER_ACCOUNT },
    ],
    ['an unknown kind', { kind: 'debt_payment', categoryId: CATEGORY }],
    ['a zero amount', { kind: 'expense', categoryId: CATEGORY, amountCents: 0 }],
    ['a note too long', { kind: 'expense', categoryId: CATEGORY, note: 'x'.repeat(121) }],
  ])('rejects %s', (_case, override) => {
    expect(transactionInputSchema.safeParse({ ...base, ...override }).success).toBe(false)
  })
})

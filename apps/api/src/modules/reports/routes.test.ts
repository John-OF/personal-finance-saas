import type { Account, Category, MonthSummary, Transaction } from '@pf/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../test/client'
import { startApiDatabase } from '../../test/db'

vi.mock('../../lib/session', async () => (await import('../../test/app')).mockSession())

const USER_A = '00000000-0000-4000-8000-00000000000a'
const USER_B = '00000000-0000-4000-8000-00000000000b'

let database: Awaited<ReturnType<typeof startApiDatabase>>
let client: ReturnType<typeof apiClient>

beforeAll(async () => {
  database = await startApiDatabase()
  client = apiClient(database.connectionString)
  await database.asAdmin((db) =>
    db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}')`),
  )
})

afterAll(async () => {
  await database.stop()
})

async function setUp(userId: string) {
  const account = (name: string) =>
    client.json<Account>('POST', '/accounts', userId, {
      name,
      type: 'bank',
      initialBalanceCents: 0,
    })
  const category = (kind: string, name: string) =>
    client.json<Category>('POST', '/categories', userId, { kind, name })
  return {
    bank: await account('Banco'),
    cash: await account('Efectivo'),
    food: await category('expense', 'Mercado'),
    bus: await category('expense', 'Bus'),
    salary: await category('income', 'Salario'),
  }
}

const record = (userId: string, body: Record<string, unknown>) =>
  client.json<Transaction>('POST', '/transactions', userId, body)

describe('month summary', () => {
  it('requires a session', async () => {
    expect((await client.call('GET', '/reports/summary?month=2026-10')).status).toBe(401)
  })

  it.each(['2026-13', '2026-1', '', '2026-10-01'])('rejects the month %s', async (month) => {
    const res = await client.call('GET', `/reports/summary?month=${month}`, USER_A)
    expect(res.status).toBe(400)
  })

  it("adds up the month's income and expenses, by category and by day", async () => {
    const { bank, cash, food, bus, salary } = await setUp(USER_A)
    const expense = (date: string, amountCents: number, categoryId: string) =>
      record(USER_A, { kind: 'expense', date, amountCents, accountId: cash.id, categoryId })
    await record(USER_A, {
      kind: 'income',
      date: '2026-10-01',
      amountCents: 90_000,
      accountId: bank.id,
      categoryId: salary.id,
    })
    await expense('2026-10-01', 1_500, food.id)
    await expense('2026-10-03', 2_500, food.id)
    await expense('2026-10-31', 300, bus.id)
    // Left out: a transfer, a deleted expense and other months.
    await record(USER_A, {
      kind: 'transfer',
      date: '2026-10-02',
      amountCents: 20_000,
      accountId: bank.id,
      toAccountId: cash.id,
    })
    const deleted = await expense('2026-10-04', 9_999, food.id)
    await client.call('DELETE', `/transactions/${deleted.id}`, USER_A)
    await expense('2026-09-30', 777, food.id)
    await expense('2026-11-01', 777, food.id)
    // Another user's month does not count either.
    const other = await setUp(USER_B)
    await record(USER_B, {
      kind: 'expense',
      date: '2026-10-05',
      amountCents: 5_000,
      accountId: other.cash.id,
      categoryId: other.food.id,
    })

    const summary = await client.json<MonthSummary>('GET', '/reports/summary?month=2026-10', USER_A)
    expect(summary).toEqual({
      month: '2026-10',
      incomeCents: 90_000,
      expenseCents: 4_300,
      categories: [
        { categoryId: salary.id, kind: 'income', totalCents: 90_000 },
        { categoryId: food.id, kind: 'expense', totalCents: 4_000 },
        { categoryId: bus.id, kind: 'expense', totalCents: 300 },
      ],
      days: [
        { date: '2026-10-01', incomeCents: 90_000, expenseCents: 1_500 },
        { date: '2026-10-03', incomeCents: 0, expenseCents: 2_500 },
        { date: '2026-10-31', incomeCents: 0, expenseCents: 300 },
      ],
    })
  })

  it('is empty for a month without transactions', async () => {
    expect(
      await client.json<MonthSummary>('GET', '/reports/summary?month=2020-02', USER_A),
    ).toEqual({
      month: '2020-02',
      incomeCents: 0,
      expenseCents: 0,
      categories: [],
      days: [],
    })
  })
})

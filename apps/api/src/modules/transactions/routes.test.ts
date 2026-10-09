import type {
  Account,
  AccountsResponse,
  CategoriesResponse,
  Category,
  Transaction,
  TransactionsResponse,
} from '@pf/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../test/client'
import { startApiDatabase } from '../../test/db'

vi.mock('../../lib/session', async () => (await import('../../test/app')).mockSession())

const USER_A = '00000000-0000-4000-8000-00000000000a'
const USER_B = '00000000-0000-4000-8000-00000000000b'
const LEAVING = '00000000-0000-4000-8000-00000000000c'
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff'

let database: Awaited<ReturnType<typeof startApiDatabase>>
let client: ReturnType<typeof apiClient>

beforeAll(async () => {
  database = await startApiDatabase()
  client = apiClient(database.connectionString)
  await database.asAdmin((db) =>
    db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}'), ('${LEAVING}')`),
  )
})

afterAll(async () => {
  await database.stop()
})

/** A user with two accounts and a category of each kind, so tests do not see each other's data. */
async function setUp(userId = USER_A) {
  const account = (name: string) =>
    client.json<Account>('POST', '/accounts', userId, {
      name,
      type: 'bank',
      initialBalanceCents: 0,
    })
  const category = (kind: string, name: string) =>
    client.json<Category>('POST', '/categories', userId, { kind, name })
  const suffix = crypto.randomUUID().slice(0, 8)
  return {
    bank: await account(`Banco ${suffix}`),
    cash: await account(`Efectivo ${suffix}`),
    food: await category('expense', `Comida ${suffix}`),
    salary: await category('income', `Sueldo ${suffix}`),
  }
}

const record = (body: Record<string, unknown>, userId = USER_A) =>
  client.json<Transaction>('POST', '/transactions', userId, body)

const list = (query: Record<string, string>, userId = USER_A) =>
  client.json<TransactionsResponse>(
    'GET',
    `/transactions?${new URLSearchParams(query).toString()}`,
    userId,
  )

describe('recording', () => {
  it('requires a session', async () => {
    expect((await client.call('GET', '/transactions')).status).toBe(401)
    expect((await client.call('POST', '/transactions', undefined, {})).status).toBe(401)
  })

  it('records an expense, an income and a transfer', async () => {
    const { bank, cash, food, salary } = await setUp()
    const expense = await record({
      kind: 'expense',
      date: '2026-10-08',
      amountCents: 2550,
      accountId: cash.id,
      categoryId: food.id,
      note: ' Almuerzo ',
    })
    expect(expense).toEqual({
      id: expense.id,
      kind: 'expense',
      date: '2026-10-08',
      amountCents: 2550,
      accountId: cash.id,
      toAccountId: null,
      categoryId: food.id,
      note: 'Almuerzo',
    })
    const income = await record({
      kind: 'income',
      date: '2026-10-01',
      amountCents: 80_000,
      accountId: bank.id,
      categoryId: salary.id,
    })
    expect(income).toMatchObject({ kind: 'income', note: '', toAccountId: null })
    const transfer = await record({
      kind: 'transfer',
      date: '2026-10-02',
      amountCents: 10_000,
      accountId: bank.id,
      toAccountId: cash.id,
    })
    expect(transfer).toMatchObject({ kind: 'transfer', toAccountId: cash.id, categoryId: null })
  })

  it("rejects accounts and categories that are not the user's, saying which", async () => {
    const { bank, food, salary } = await setUp()
    const other = await setUp(USER_B)
    const base = { date: '2026-10-08', amountCents: 100 }

    const foreign = await client.call('POST', '/transactions', USER_A, {
      ...base,
      kind: 'expense',
      accountId: other.bank.id,
      categoryId: other.food.id,
    })
    expect(foreign.status).toBe(400)
    expect(await foreign.json()).toMatchObject({
      error: {
        fields: {
          accountId: ['Elige una de tus cuentas.'],
          categoryId: ['Elige una de tus categorías.'],
        },
      },
    })

    const wrongKind = await client.call('POST', '/transactions', USER_A, {
      ...base,
      kind: 'expense',
      accountId: bank.id,
      categoryId: salary.id,
    })
    expect(wrongKind.status).toBe(400)

    const foreignTarget = await client.call('POST', '/transactions', USER_A, {
      ...base,
      kind: 'transfer',
      accountId: bank.id,
      toAccountId: other.cash.id,
    })
    expect(await foreignTarget.json()).toMatchObject({
      error: { fields: { toAccountId: ['Elige una de tus cuentas.'] } },
    })
    expect((await list({ categoryId: food.id })).transactions).toEqual([])
  })

  it('rewrites every field on edit, clearing the ones of the old kind', async () => {
    const { bank, cash, food } = await setUp()
    const expense = await record({
      kind: 'expense',
      date: '2026-10-08',
      amountCents: 2550,
      accountId: cash.id,
      categoryId: food.id,
      note: 'Taxi',
    })
    const transfer = await client.json<Transaction>('PUT', `/transactions/${expense.id}`, USER_A, {
      kind: 'transfer',
      date: '2026-10-09',
      amountCents: 3000,
      accountId: cash.id,
      toAccountId: bank.id,
    })
    expect(transfer).toEqual({
      id: expense.id,
      kind: 'transfer',
      date: '2026-10-09',
      amountCents: 3000,
      accountId: cash.id,
      toAccountId: bank.id,
      categoryId: null,
      note: '',
    })
  })

  it('deletes and restores, once each', async () => {
    const { cash, food } = await setUp()
    const expense = await record({
      kind: 'expense',
      date: '2026-10-08',
      amountCents: 100,
      accountId: cash.id,
      categoryId: food.id,
    })
    expect((await client.call('DELETE', `/transactions/${expense.id}`, USER_A)).status).toBe(204)
    expect((await client.call('DELETE', `/transactions/${expense.id}`, USER_A)).status).toBe(404)
    const edit = await client.call('PUT', `/transactions/${expense.id}`, USER_A, {
      kind: 'expense',
      date: '2026-10-08',
      amountCents: 200,
      accountId: cash.id,
      categoryId: food.id,
    })
    expect(edit.status).toBe(404)
    expect((await list({ accountId: cash.id })).transactions).toEqual([])

    const restored = await client.json<Transaction>(
      'POST',
      `/transactions/${expense.id}/restore`,
      USER_A,
    )
    expect(restored).toEqual(expense)
    const again = await client.call('POST', `/transactions/${expense.id}/restore`, USER_A)
    expect(again.status).toBe(404)
  })
})

describe('listing', () => {
  it('goes newest first, page by page, with the totals on the first page', async () => {
    const { bank, food, salary } = await setUp()
    for (const [date, amountCents] of [
      ['2026-10-01', 100],
      ['2026-10-03', 200],
      ['2026-10-03', 300],
      ['2026-10-02', 400],
      ['2026-09-30', 500],
    ] as const) {
      await record({ kind: 'expense', date, amountCents, accountId: bank.id, categoryId: food.id })
    }
    await record({
      kind: 'income',
      date: '2026-10-05',
      amountCents: 10_000,
      accountId: bank.id,
      categoryId: salary.id,
    })

    const first = await list({ accountId: bank.id, limit: '4' })
    expect(first.transactions.map(({ amountCents }) => amountCents)).toEqual([
      10_000, 300, 200, 400,
    ])
    expect(first.totals).toEqual({ count: 6, incomeCents: 10_000, expenseCents: 1500 })
    expect(first.nextCursor).not.toBeNull()

    const second = await list({ accountId: bank.id, limit: '4', cursor: first.nextCursor ?? '' })
    expect(second.transactions.map(({ amountCents }) => amountCents)).toEqual([100, 500])
    expect(second.totals).toBeNull()
    expect(second.nextCursor).toBeNull()
  })

  it('pages through one day, last recorded first, without skipping or repeating', async () => {
    const { cash, food } = await setUp()
    for (let n = 1; n <= 5; n++) {
      await record({
        kind: 'expense',
        date: '2026-10-08',
        amountCents: n,
        accountId: cash.id,
        categoryId: food.id,
      })
    }
    const seen: number[] = []
    let cursor: string | null = null
    do {
      const page: TransactionsResponse = await list({
        accountId: cash.id,
        limit: '2',
        ...(cursor ? { cursor } : {}),
      })
      seen.push(...page.transactions.map(({ amountCents }) => amountCents))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toEqual([5, 4, 3, 2, 1])
  })

  it('filters by dates, kind, account, category and text', async () => {
    const { bank, cash, food, salary } = await setUp()
    const lunch = await record({
      kind: 'expense',
      date: '2026-10-08',
      amountCents: 1200,
      accountId: cash.id,
      categoryId: food.id,
      note: 'Almuerzo 100% casero',
    })
    const pay = await record({
      kind: 'income',
      date: '2026-09-30',
      amountCents: 90_000,
      accountId: bank.id,
      categoryId: salary.id,
    })
    const move = await record({
      kind: 'transfer',
      date: '2026-10-02',
      amountCents: 5000,
      accountId: bank.id,
      toAccountId: cash.id,
    })
    const ids = async (query: Record<string, string>) =>
      (await list(query)).transactions.map(({ id }) => id)

    expect(await ids({ accountId: cash.id })).toEqual([lunch.id, move.id])
    expect(await ids({ accountId: bank.id, from: '2026-10-01', to: '2026-10-31' })).toEqual([
      move.id,
    ])
    expect(await ids({ accountId: bank.id, kind: 'income' })).toEqual([pay.id])
    expect(await ids({ categoryId: food.id })).toEqual([lunch.id])
    expect(await ids({ accountId: cash.id, q: 'ALMUERZO' })).toEqual([lunch.id])
    // The category's name matches too, and % is searched literally.
    expect(await ids({ accountId: bank.id, q: salary.name.slice(0, 6) })).toEqual([pay.id])
    expect(await ids({ accountId: cash.id, q: '100%' })).toEqual([lunch.id])
    expect(await ids({ accountId: cash.id, q: '%' })).toEqual([lunch.id])
    expect(await ids({ accountId: cash.id, q: '_' })).toEqual([])
  })

  it.each([
    ['dates in the wrong order', { from: '2026-10-08', to: '2026-10-01' }],
    ['an invalid date', { from: '2026-02-30' }],
    ['an unknown kind', { kind: 'loan' }],
    ['a page too big', { limit: '500' }],
    ['a made-up cursor', { cursor: 'not-a-cursor' }],
    ['a forged cursor', { cursor: btoa("2026-10-08|now'); drop table x; --|x") }],
    ['an unknown filter', { color: 'red' }],
  ])('rejects %s', async (_case, query) => {
    const res = await client.call(
      'GET',
      `/transactions?${new URLSearchParams(query).toString()}`,
      USER_A,
    )
    expect(res.status).toBe(400)
  })
})

describe('isolation between users', () => {
  it("does not list, edit, delete or restore another user's transaction", async () => {
    const { cash, food } = await setUp()
    const mine = await record({
      kind: 'expense',
      date: '2026-10-08',
      amountCents: 4200,
      accountId: cash.id,
      categoryId: food.id,
    })
    const theirs = await setUp(USER_B)

    expect((await list({}, USER_B)).transactions.map(({ id }) => id)).not.toContain(mine.id)
    const edit = await client.call('PUT', `/transactions/${mine.id}`, USER_B, {
      kind: 'expense',
      date: '2026-10-08',
      amountCents: 1,
      accountId: theirs.cash.id,
      categoryId: theirs.food.id,
    })
    expect(edit.status).toBe(404)
    expect((await client.call('DELETE', `/transactions/${mine.id}`, USER_B)).status).toBe(404)

    await client.call('DELETE', `/transactions/${mine.id}`, USER_A)
    const restore = await client.call('POST', `/transactions/${mine.id}/restore`, USER_B)
    expect(restore.status).toBe(404)
  })

  it('answers 404 for a transaction that does not exist', async () => {
    const { cash, food } = await setUp()
    const res = await client.call('PUT', `/transactions/${UNKNOWN}`, USER_A, {
      kind: 'expense',
      date: '2026-10-08',
      amountCents: 1,
      accountId: cash.id,
      categoryId: food.id,
    })
    expect(res.status).toBe(404)
  })

  it("cannot attach a transaction to another user's account or category, even in the database", async () => {
    const mine = await setUp()
    const theirs = await setUp(USER_B)
    const insert = (accountId: string, categoryId: string, kind = 'expense') =>
      database.asAdmin((db) =>
        db.query(
          `insert into transactions (user_id, kind, date, amount_cents, account_id, category_id)
           values ($1, $2, '2026-10-08', 100, $3, $4)`,
          [USER_A, kind, accountId, categoryId],
        ),
      )
    await expect(insert(theirs.cash.id, mine.food.id)).rejects.toThrow(/transactions_account_fk/)
    await expect(insert(mine.cash.id, theirs.food.id)).rejects.toThrow(/transactions_category_fk/)
    // An income cannot use an expense category either.
    await expect(insert(mine.cash.id, mine.food.id, 'income')).rejects.toThrow(
      /transactions_category_fk/,
    )
  })
})

describe('deleting the user', () => {
  it('takes their accounts, categories and transactions with them', async () => {
    const { bank, cash, food } = await setUp(LEAVING)
    await record(
      {
        kind: 'expense',
        date: '2026-10-08',
        amountCents: 100,
        accountId: cash.id,
        categoryId: food.id,
      },
      LEAVING,
    )
    await record(
      {
        kind: 'transfer',
        date: '2026-10-08',
        amountCents: 100,
        accountId: bank.id,
        toAccountId: cash.id,
      },
      LEAVING,
    )
    const counts = await database.asAdmin(async (db) => {
      await db.query('delete from auth.users where id = $1', [LEAVING])
      const { rows } = await db.query<{ n: number }>(
        `select (select count(*) from transactions where user_id = $1)
              + (select count(*) from accounts where user_id = $1)
              + (select count(*) from categories where user_id = $1) as n`,
        [LEAVING],
      )
      return rows[0]?.n
    })
    expect(Number(counts)).toBe(0)
  })
})

describe('balances', () => {
  it('match the transactions of each account', async () => {
    const { bank, cash, food, salary } = await setUp()
    await record({
      kind: 'income',
      date: '2026-10-01',
      amountCents: 50_000,
      accountId: bank.id,
      categoryId: salary.id,
    })
    await record({
      kind: 'transfer',
      date: '2026-10-02',
      amountCents: 8_000,
      accountId: bank.id,
      toAccountId: cash.id,
    })
    await record({
      kind: 'expense',
      date: '2026-10-03',
      amountCents: 1_250,
      accountId: cash.id,
      categoryId: food.id,
    })
    const { accounts } = await client.json<AccountsResponse>('GET', '/accounts', USER_A)
    const balance = (id: string) => accounts.find((a) => a.id === id)?.balanceCents
    expect(balance(bank.id)).toBe(42_000)
    expect(balance(cash.id)).toBe(6_750)
    const { categories } = await client.json<CategoriesResponse>('GET', '/categories', USER_A)
    expect(categories.find(({ id }) => id === food.id)).toBeDefined()
  })
})

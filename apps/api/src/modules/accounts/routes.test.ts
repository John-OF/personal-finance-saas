import type { Account, AccountsResponse, CategoriesResponse, Transaction } from '@pf/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../test/client'
import { startApiDatabase } from '../../test/db'

vi.mock('../../lib/session', async () => (await import('../../test/app')).mockSession())

const USER_A = '00000000-0000-4000-8000-00000000000a'
const USER_B = '00000000-0000-4000-8000-00000000000b'
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff'

let database: Awaited<ReturnType<typeof startApiDatabase>>
let client: ReturnType<typeof apiClient>
let expenseCategory: string
let incomeCategory: string

beforeAll(async () => {
  database = await startApiDatabase()
  client = apiClient(database.connectionString)
  await database.asAdmin((db) =>
    db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}')`),
  )
  const { categories } = await client.json<CategoriesResponse>('GET', '/categories', USER_A)
  expenseCategory = categories.find((c) => c.kind === 'expense')?.id ?? ''
  incomeCategory = categories.find((c) => c.kind === 'income')?.id ?? ''
})

afterAll(async () => {
  await database.stop()
})

const newAccount = (fields: Partial<Account> = {}, userId = USER_A) =>
  client.json<Account>('POST', '/accounts', userId, {
    name: 'Banco',
    type: 'bank',
    initialBalanceCents: 0,
    ...fields,
  })

const accountsOf = async (userId = USER_A) =>
  (await client.json<AccountsResponse>('GET', '/accounts', userId)).accounts

const balanceOf = async (accountId: string) =>
  (await accountsOf()).find(({ id }) => id === accountId)?.balanceCents

const record = (body: Record<string, unknown>) =>
  client.json<Transaction>('POST', '/transactions', USER_A, { date: '2026-10-08', ...body })

describe('accounts', () => {
  it('requires a session', async () => {
    expect((await client.call('GET', '/accounts')).status).toBe(401)
  })

  it('creates an account counted in the net worth by default', async () => {
    const account = await newAccount({ name: 'Efectivo', type: 'cash', initialBalanceCents: 4550 })
    expect(account).toEqual({
      id: account.id,
      name: 'Efectivo',
      type: 'cash',
      initialBalanceCents: 4550,
      includeInNetWorth: true,
      archived: false,
      balanceCents: 4550,
    })
    expect(await accountsOf()).toContainEqual(account)
  })

  it('takes a card that starts in debt', async () => {
    const card = await newAccount({ type: 'card', initialBalanceCents: -120_000 })
    expect(card.balanceCents).toBe(-120_000)
  })

  it.each([
    ['an unknown type', { type: 'crypto' }],
    ['an empty name', { name: '  ' }],
    ['a name too long', { name: 'x'.repeat(41) }],
    ['a balance too large', { initialBalanceCents: 100_000_000_000 }],
    ['a balance with decimals', { initialBalanceCents: 10.5 }],
    ['an unknown field', { color: 'red' }],
  ])('rejects %s', async (_case, override) => {
    const res = await client.call('POST', '/accounts', USER_A, {
      name: 'Banco',
      type: 'bank',
      initialBalanceCents: 0,
      ...override,
    })
    expect(res.status).toBe(400)
  })

  it('adds income and subtracts expenses and transfers out, without deleted transactions', async () => {
    const bank = await newAccount({ initialBalanceCents: 10_000 })
    const cash = await newAccount({ type: 'cash' })
    await record({
      kind: 'income',
      amountCents: 50_000,
      accountId: bank.id,
      categoryId: incomeCategory,
    })
    await record({
      kind: 'expense',
      amountCents: 2_550,
      accountId: bank.id,
      categoryId: expenseCategory,
    })
    await record({ kind: 'transfer', amountCents: 7_000, accountId: bank.id, toAccountId: cash.id })
    const deleted = await record({
      kind: 'expense',
      amountCents: 999,
      accountId: bank.id,
      categoryId: expenseCategory,
    })
    await client.call('DELETE', `/transactions/${deleted.id}`, USER_A)

    expect(await balanceOf(bank.id)).toBe(10_000 + 50_000 - 2_550 - 7_000)
    expect(await balanceOf(cash.id)).toBe(7_000)
  })

  it('edits, archives (listed last) and reopens an account', async () => {
    const account = await newAccount({ name: 'Billetera' })
    const edited = await client.json<Account>('PATCH', `/accounts/${account.id}`, USER_A, {
      name: 'Deuna',
      type: 'wallet',
      includeInNetWorth: false,
      archived: true,
    })
    expect(edited).toMatchObject({
      name: 'Deuna',
      type: 'wallet',
      includeInNetWorth: false,
      archived: true,
    })
    expect((await accountsOf()).at(-1)?.id).toBe(account.id)

    const reopened = await client.json<Account>('PATCH', `/accounts/${account.id}`, USER_A, {
      archived: false,
    })
    expect(reopened.archived).toBe(false)
  })

  it('rejects an empty update', async () => {
    const account = await newAccount()
    expect((await client.call('PATCH', `/accounts/${account.id}`, USER_A, {})).status).toBe(400)
  })

  it('deletes an account without transactions', async () => {
    const account = await newAccount()
    expect((await client.call('DELETE', `/accounts/${account.id}`, USER_A)).status).toBe(204)
    expect((await accountsOf()).map(({ id }) => id)).not.toContain(account.id)
  })

  it('only archives an account with transactions, even deleted ones', async () => {
    const account = await newAccount()
    const target = await newAccount()
    const transfer = await record({
      kind: 'transfer',
      amountCents: 100,
      accountId: target.id,
      toAccountId: account.id,
    })
    await client.call('DELETE', `/transactions/${transfer.id}`, USER_A)

    for (const { id } of [account, target]) {
      const res = await client.call('DELETE', `/accounts/${id}`, USER_A)
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'in_use' } })
    }
  })

  it('answers 404 for an account that does not exist', async () => {
    expect((await client.call('DELETE', `/accounts/${UNKNOWN}`, USER_A)).status).toBe(404)
    expect((await client.call('PATCH', `/accounts/not-a-uuid`, USER_A, { name: 'x' })).status).toBe(
      404,
    )
  })
})

describe('isolation between users', () => {
  it("does not list, edit or delete another user's account", async () => {
    const account = await newAccount({ name: 'De A' })
    expect((await accountsOf(USER_B)).map(({ id }) => id)).not.toContain(account.id)
    const update = await client.call('PATCH', `/accounts/${account.id}`, USER_B, { name: 'Mía' })
    expect(update.status).toBe(404)
    expect((await client.call('DELETE', `/accounts/${account.id}`, USER_B)).status).toBe(404)
    expect((await accountsOf()).find(({ id }) => id === account.id)?.name).toBe('De A')
  })
})

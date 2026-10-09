import {
  addDays,
  DEFAULT_CATEGORIES,
  todayIn,
  type Account,
  type CategoriesResponse,
  type Category,
  type Transaction,
} from '@pf/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../test/client'
import { startApiDatabase } from '../../test/db'

vi.mock('../../lib/session', async () => (await import('../../test/app')).mockSession())

const USER_A = '00000000-0000-4000-8000-00000000000a'
const USER_B = '00000000-0000-4000-8000-00000000000b'
const NEW_USER = '00000000-0000-4000-8000-00000000000c'

let database: Awaited<ReturnType<typeof startApiDatabase>>
let client: ReturnType<typeof apiClient>
let account: Account

beforeAll(async () => {
  database = await startApiDatabase()
  client = apiClient(database.connectionString)
  await database.asAdmin((db) =>
    db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}'), ('${NEW_USER}')`),
  )
  account = await client.json<Account>('POST', '/accounts', USER_A, {
    name: 'Efectivo',
    type: 'cash',
    initialBalanceCents: 0,
  })
})

afterAll(async () => {
  await database.stop()
})

const categoriesOf = async (userId = USER_A) =>
  (await client.json<CategoriesResponse>('GET', '/categories', userId)).categories

const newCategory = (name: string, kind = 'expense', userId = USER_A) =>
  client.json<Category>('POST', '/categories', userId, { kind, name })

const spend = (categoryId: string, date: string) =>
  client.json<Transaction>('POST', '/transactions', USER_A, {
    kind: 'expense',
    date,
    amountCents: 500,
    accountId: account.id,
    categoryId,
  })

describe('categories', () => {
  it('requires a session', async () => {
    expect((await client.call('GET', '/categories')).status).toBe(401)
  })

  it('gives a new user the default categories, by name', async () => {
    const categories = await categoriesOf(NEW_USER)
    const names = (kind: string) =>
      categories.filter((c) => c.kind === kind).map(({ name }) => name)
    expect(names('expense')).toEqual(
      [...DEFAULT_CATEGORIES.expense].sort((a, b) => a.localeCompare(b, 'es')),
    )
    expect(names('income')).toEqual(
      [...DEFAULT_CATEGORIES.income].sort((a, b) => a.localeCompare(b, 'es')),
    )
    expect(categories.every((c) => !c.archived && c.recentUseCount === 0)).toBe(true)
  })

  it('creates a category, unique by name within its kind regardless of case', async () => {
    const pets = await newCategory('Mascotas')
    expect(pets).toEqual({
      id: pets.id,
      kind: 'expense',
      name: 'Mascotas',
      archived: false,
      recentUseCount: 0,
    })
    const again = await client.call('POST', '/categories', USER_A, {
      kind: 'expense',
      name: ' mascotas ',
    })
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ error: { code: 'duplicate_name' } })
    expect((await newCategory('Mascotas', 'income')).kind).toBe('income')
  })

  it.each([
    ['an unknown kind', { kind: 'transfer', name: 'x' }],
    ['an empty name', { kind: 'expense', name: ' ' }],
    ['a name too long', { kind: 'expense', name: 'x'.repeat(41) }],
    ['an unknown field', { kind: 'expense', name: 'x', color: 'red' }],
  ])('rejects %s', async (_case, body) => {
    expect((await client.call('POST', '/categories', USER_A, body)).status).toBe(400)
  })

  it('renames and archives, but not onto a name in use', async () => {
    const gifts = await newCategory('Regalos')
    const renamed = await client.json<Category>('PATCH', `/categories/${gifts.id}`, USER_A, {
      name: 'Regalos y fiestas',
      archived: true,
    })
    expect(renamed).toMatchObject({ name: 'Regalos y fiestas', archived: true })
    // Changing only the case of its own name is fine.
    await client.json('PATCH', `/categories/${gifts.id}`, USER_A, { name: 'regalos y fiestas' })

    const clash = await client.call('PATCH', `/categories/${gifts.id}`, USER_A, { name: 'COMIDA' })
    expect(clash.status).toBe(409)
  })

  it('counts the uses of the last 90 days', async () => {
    const coffee = await newCategory('Café')
    const today = todayIn('UTC')
    await spend(coffee.id, today)
    await spend(coffee.id, addDays(today, -30))
    await spend(coffee.id, addDays(today, -200))
    const found = (await categoriesOf()).find(({ id }) => id === coffee.id)
    expect(found?.recentUseCount).toBe(2)
  })

  it('deletes a category without transactions and only archives a used one', async () => {
    const unused = await newCategory('Sin usar')
    expect((await client.call('DELETE', `/categories/${unused.id}`, USER_A)).status).toBe(204)

    const used = await newCategory('Usada')
    const transaction = await spend(used.id, '2026-10-01')
    await client.call('DELETE', `/transactions/${transaction.id}`, USER_A)
    const res = await client.call('DELETE', `/categories/${used.id}`, USER_A)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'in_use' } })
  })
})

describe('isolation between users', () => {
  it("does not list, edit or delete another user's category", async () => {
    const mine = await newCategory('Solo de A')
    expect((await categoriesOf(USER_B)).map(({ id }) => id)).not.toContain(mine.id)
    const rename = await client.call('PATCH', `/categories/${mine.id}`, USER_B, { name: 'Mía' })
    expect(rename.status).toBe(404)
    expect((await client.call('DELETE', `/categories/${mine.id}`, USER_B)).status).toBe(404)
  })

  it("lets each user have their own category with another's name", async () => {
    await newCategory('Peluquería', 'expense', USER_A)
    expect((await newCategory('Peluquería', 'expense', USER_B)).name).toBe('Peluquería')
  })
})

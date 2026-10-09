import type {
  Account,
  CategoriesResponse,
  CommissionBulkPayoutResponse,
  CommissionEntriesResponse,
  CommissionEntry,
  CommissionImportResponse,
  CommissionPayout,
  CommissionPlan,
  CommissionPlansResponse,
  CommissionWeeksResponse,
  TransactionsResponse,
} from '@pf/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { app } from '../../app'
import { createExecutionContext, createTestEnv, TEST_USER_HEADER } from '../../test/app'
import { apiClient } from '../../test/client'
import { startApiDatabase } from '../../test/db'

vi.mock('../../lib/session', async () => (await import('../../test/app')).mockSession())

const USER_A = '00000000-0000-4000-8000-00000000000a'
const USER_B = '00000000-0000-4000-8000-00000000000b'
const SUNDAY_TO_SATURDAY = { periodEndWeekday: 6, paydayOffsetDays: 0 }

let database: Awaited<ReturnType<typeof startApiDatabase>>

beforeAll(async () => {
  // Only Date is faked: "today" decides the first rate's date. Timers stay real for the sockets.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T15:00:00Z'))
  database = await startApiDatabase()
  await database.asAdmin((db) =>
    db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}')`),
  )
})

afterAll(async () => {
  vi.useRealTimers()
  await database.stop()
})

async function call(method: string, path: string, userId?: string, body?: unknown) {
  const { ctx, settle } = createExecutionContext()
  const init: RequestInit = { method, headers: { Origin: 'http://localhost' } }
  const headers = init.headers as Record<string, string>
  if (userId) headers[TEST_USER_HEADER] = userId
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await app.request(
    `/api/v1/commission${path}`,
    init,
    createTestEnv(database.connectionString),
    ctx,
  )
  await settle()
  return res
}

async function json<T>(method: string, path: string, userId: string, body?: unknown) {
  const res = await call(method, path, userId, body)
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
  return res.json<T>()
}

async function newPlan(userId = USER_A, name = 'Mis ingresos') {
  return json<CommissionPlan>('POST', '/plans', userId, {
    name,
    ...SUNDAY_TO_SATURDAY,
    percentBp: 5000,
  })
}

const addEntry = (planId: string, date: string, amountCents: number, note?: string) =>
  json<CommissionEntry>('POST', `/plans/${planId}/entries`, USER_A, { date, amountCents, note })

const weeksOf = async (planId: string) =>
  (await json<CommissionWeeksResponse>('GET', `/plans/${planId}/weeks`, USER_A)).weeks

const entriesOf = async (planId: string, query = '') =>
  (await json<CommissionEntriesResponse>('GET', `/plans/${planId}/entries${query}`, USER_A)).entries

describe('plans', () => {
  it('requires a session', async () => {
    expect((await call('GET', '/plans')).status).toBe(401)
  })

  it('creates a plan whose first percentage starts today, in the user time zone', async () => {
    const plan = await newPlan(USER_A, 'Peluquería')
    expect(plan).toMatchObject({
      name: 'Peluquería',
      ...SUNDAY_TO_SATURDAY,
      rates: [{ percentBp: 5000, effectiveFrom: '2026-10-08' }],
    })
    const { plans } = await json<CommissionPlansResponse>('GET', '/plans', USER_A)
    expect(plans.map(({ id }) => id)).toContain(plan.id)
  })

  it.each([
    ['a weekday out of range', { periodEndWeekday: 7 }],
    ['a percentage over 100', { percentBp: 10001 }],
    ['an empty name', { name: ' ' }],
    ['an unknown field', { color: 'red' }],
  ])('rejects %s', async (_case, override) => {
    const res = await call('POST', '/plans', USER_A, {
      name: 'x',
      ...SUNDAY_TO_SATURDAY,
      percentBp: 5000,
      ...override,
    })
    expect(res.status).toBe(400)
  })

  it('changes the name and the schedule, regrouping the weeks', async () => {
    const plan = await newPlan()
    await addEntry(plan.id, '2026-10-10', 1000) // a Saturday
    expect((await weeksOf(plan.id))[0]?.payday).toBe('2026-10-10')

    const updated = await json<CommissionPlan>('PATCH', `/plans/${plan.id}`, USER_A, {
      name: 'Salón',
      periodEndWeekday: 5,
      paydayOffsetDays: 1,
    })
    expect(updated.name).toBe('Salón')
    // From Saturday to Friday, a Saturday is paid the next Saturday.
    expect((await weeksOf(plan.id))[0]?.payday).toBe('2026-10-17')
  })
})

describe('entries', () => {
  it('lists them by date and in the order recorded, in a range or all', async () => {
    const plan = await newPlan()
    const late = await addEntry(plan.id, '2026-10-06', 1500, 'tarde')
    await addEntry(plan.id, '2026-10-05', 2500)
    const later = await addEntry(plan.id, '2026-10-06', 500, '  propina  ')
    await addEntry(plan.id, '2026-09-01', 100)

    const week = await entriesOf(plan.id, '?from=2026-10-04&to=2026-10-10')
    expect(week.map(({ date, amountCents, note }) => [date, amountCents, note])).toEqual([
      ['2026-10-05', 2500, ''],
      ['2026-10-06', 1500, 'tarde'],
      ['2026-10-06', 500, 'propina'],
    ])
    expect(week[1]?.id).toBe(late.id)
    expect(week[2]?.id).toBe(later.id)
    expect(await entriesOf(plan.id)).toHaveLength(4)
  })

  it.each([
    ['only one end of the range', '?from=2026-10-04'],
    ['a range going backwards', '?from=2026-10-10&to=2026-10-04'],
    ['a range over 62 days', '?from=2026-01-01&to=2026-06-01'],
    ['an invalid date', '?from=2026-02-30&to=2026-03-02'],
  ])('rejects %s', async (_case, query) => {
    const plan = await newPlan()
    expect((await call('GET', `/plans/${plan.id}/entries${query}`, USER_A)).status).toBe(400)
  })

  it.each([
    ['a zero amount', { amountCents: 0 }],
    ['an amount over the limit', { amountCents: 100_000_000_000 }],
    ['a fractional amount', { amountCents: 10.5 }],
    ['a note over 80 characters', { note: 'x'.repeat(81) }],
    ['an impossible date', { date: '2026-02-30' }],
  ])('rejects an entry with %s', async (_case, override) => {
    const plan = await newPlan()
    const res = await call('POST', `/plans/${plan.id}/entries`, USER_A, {
      date: '2026-10-05',
      amountCents: 100,
      ...override,
    })
    expect(res.status).toBe(400)
  })

  it('edits, deletes and restores an entry', async () => {
    const plan = await newPlan()
    const entry = await addEntry(plan.id, '2026-10-05', 1000)

    const edited = await json<CommissionEntry>('PATCH', `/entries/${entry.id}`, USER_A, {
      amountCents: 1200,
      note: 'corregido',
    })
    expect(edited).toMatchObject({ id: entry.id, amountCents: 1200, note: 'corregido' })

    expect((await call('DELETE', `/entries/${entry.id}`, USER_A)).status).toBe(204)
    expect(await entriesOf(plan.id)).toEqual([])
    expect(await weeksOf(plan.id)).toEqual([])
    expect((await call('DELETE', `/entries/${entry.id}`, USER_A)).status).toBe(404)
    expect((await call('PATCH', `/entries/${entry.id}`, USER_A, { note: 'x' })).status).toBe(404)

    const restored = await json<CommissionEntry>('POST', `/entries/${entry.id}/restore`, USER_A)
    expect(restored).toMatchObject({ id: entry.id, amountCents: 1200 })
    expect(await entriesOf(plan.id)).toHaveLength(1)
    expect((await call('POST', `/entries/${entry.id}/restore`, USER_A)).status).toBe(404)
  })
})

describe('weeks and payouts', () => {
  it('adds up each week and rounds the share once per week', async () => {
    const plan = await newPlan()
    await addEntry(plan.id, '2026-10-05', 125)
    await addEntry(plan.id, '2026-10-06', 125)
    await addEntry(plan.id, '2026-10-06', 1000)
    await addEntry(plan.id, '2026-09-30', 2000)
    const weeks = await weeksOf(plan.id)
    expect(weeks).toMatchObject([
      { payday: '2026-10-10', grossCents: 1250, daysWorked: 2, expectedCents: 625, payout: null },
      { payday: '2026-10-03', grossCents: 2000, daysWorked: 1, expectedCents: 1000 },
    ])
  })

  it('confirms a payout with what was paid and keeps that snapshot', async () => {
    const plan = await newPlan()
    const entry = await addEntry(plan.id, '2026-10-05', 3001)

    const payout = await json<CommissionPayout>(
      'PUT',
      `/plans/${plan.id}/payouts/2026-10-10`,
      USER_A,
      {
        paidCents: 1400,
      },
    )
    expect(payout).toMatchObject({
      payday: '2026-10-10',
      grossCents: 3001,
      percentBp: 5000,
      expectedCents: 1501,
      paidCents: 1400,
    })

    // Editing the week afterwards does not touch what was confirmed.
    await json('PATCH', `/entries/${entry.id}`, USER_A, { amountCents: 9000 })
    const [week] = await weeksOf(plan.id)
    expect(week).toMatchObject({ grossCents: 9000, expectedCents: 4500, payout })

    expect((await call('DELETE', `/plans/${plan.id}/payouts/2026-10-10`, USER_A)).status).toBe(204)
    expect((await weeksOf(plan.id))[0]?.payout).toBeNull()
    expect((await call('DELETE', `/plans/${plan.id}/payouts/2026-10-10`, USER_A)).status).toBe(404)
  })

  it('marks every unconfirmed week up to a payday as paid with the expected share', async () => {
    const plan = await newPlan()
    await addEntry(plan.id, '2026-09-14', 1001) // paid 2026-09-19
    await addEntry(plan.id, '2026-09-21', 2000) // paid 2026-09-26, already confirmed below
    await addEntry(plan.id, '2026-09-28', 3000) // paid 2026-10-03
    await addEntry(plan.id, '2026-10-05', 4000) // paid 2026-10-10, after `through`
    await json('PUT', `/plans/${plan.id}/payouts/2026-09-26`, USER_A, { paidCents: 900 })

    const result = await json<CommissionBulkPayoutResponse>(
      'POST',
      `/plans/${plan.id}/payouts/bulk`,
      USER_A,
      { through: '2026-10-03' },
    )
    // 10.01 → 5.01 and 30.00 → 15.00.
    expect(result).toEqual({ confirmed: 2, paidCents: 2001 })
    const weeks = await weeksOf(plan.id)
    expect(weeks.map(({ payday, payout }) => [payday, payout?.paidCents ?? null])).toEqual([
      ['2026-10-10', null],
      ['2026-10-03', 1500],
      ['2026-09-26', 900],
      ['2026-09-19', 501],
    ])

    const again = await json<CommissionBulkPayoutResponse>(
      'POST',
      `/plans/${plan.id}/payouts/bulk`,
      USER_A,
      { through: '2026-10-03' },
    )
    expect(again).toEqual({ confirmed: 0, paidCents: 0 })
  })

  it('only takes paydays of the plan', async () => {
    const plan = await newPlan()
    for (const payday of ['2026-10-09', '2026-02-30', 'hoy']) {
      const res = await call('PUT', `/plans/${plan.id}/payouts/${payday}`, USER_A, { paidCents: 1 })
      expect(res.status).toBe(400)
    }
  })

  it('applies a new percentage from its date on, leaving earlier weeks alone', async () => {
    const plan = await newPlan()
    await addEntry(plan.id, '2026-10-05', 1000)
    await addEntry(plan.id, '2026-10-12', 1000)

    const updated = await json<CommissionPlan>('PUT', `/plans/${plan.id}/rates`, USER_A, {
      percentBp: 6000,
      effectiveFrom: '2026-10-17',
    })
    expect(updated.rates).toEqual([
      { percentBp: 5000, effectiveFrom: '2026-10-08' },
      { percentBp: 6000, effectiveFrom: '2026-10-17' },
    ])
    expect((await weeksOf(plan.id)).map(({ expectedCents }) => expectedCents)).toEqual([600, 500])

    // The same date again replaces that rate.
    await json('PUT', `/plans/${plan.id}/rates`, USER_A, {
      percentBp: 7000,
      effectiveFrom: '2026-10-17',
    })
    expect((await weeksOf(plan.id))[0]?.expectedCents).toBe(700)

    const back = await json<CommissionPlan>('DELETE', `/plans/${plan.id}/rates/2026-10-17`, USER_A)
    expect(back.rates).toHaveLength(1)
    const last = await call('DELETE', `/plans/${plan.id}/rates/2026-10-08`, USER_A)
    expect(last.status).toBe(409)
    expect(await last.json()).toMatchObject({ error: { code: 'last_rate' } })
  })
})

describe('import', () => {
  it('adds new rows, skips those already recorded and keeps the file order', async () => {
    const plan = await newPlan()
    await addEntry(plan.id, '2026-10-05', 2500, 'mañana')

    const result = await json<CommissionImportResponse>(
      'POST',
      `/plans/${plan.id}/entries/import`,
      USER_A,
      {
        rows: [
          { date: '2026-10-05', amountCents: 2500, note: 'mañana' },
          { date: '2026-10-05', amountCents: 2500, note: 'mañana' },
          { date: '2026-10-05', amountCents: 700, note: 'b' },
          { date: '2026-10-05', amountCents: 300, note: 'c' },
        ],
      },
    )
    // The recorded entry absorbs one identical row; the second identical row is new.
    expect(result).toEqual({ added: 3, skipped: 1 })
    const entries = await entriesOf(plan.id)
    expect(entries.map(({ amountCents }) => amountCents)).toEqual([2500, 2500, 700, 300])

    const again = await json<CommissionImportResponse>(
      'POST',
      `/plans/${plan.id}/entries/import`,
      USER_A,
      { rows: [{ date: '2026-10-05', amountCents: 700, note: 'b' }] },
    )
    expect(again).toEqual({ added: 0, skipped: 1 })
  })

  it('rejects an empty or oversized batch', async () => {
    const plan = await newPlan()
    const row = { date: '2026-10-05', amountCents: 1, note: '' }
    for (const rows of [[], Array.from({ length: 251 }, () => row)]) {
      const res = await call('POST', `/plans/${plan.id}/entries/import`, USER_A, { rows })
      expect(res.status).toBe(400)
    }
  })
})

describe('isolation between users', () => {
  it("never shows or changes another user's plan, entries or payouts", async () => {
    const plan = await newPlan(USER_A)
    const entry = await addEntry(plan.id, '2026-10-05', 1000)
    await json('PUT', `/plans/${plan.id}/payouts/2026-10-10`, USER_A, { paidCents: 500 })

    const { plans } = await json<CommissionPlansResponse>('GET', '/plans', USER_B)
    expect(plans.map(({ id }) => id)).not.toContain(plan.id)

    const attempts: [string, string, unknown?][] = [
      ['PATCH', `/plans/${plan.id}`, { name: 'mío' }],
      ['PUT', `/plans/${plan.id}/rates`, { percentBp: 1, effectiveFrom: '2026-10-01' }],
      ['DELETE', `/plans/${plan.id}/rates/2026-10-08`],
      ['GET', `/plans/${plan.id}/weeks`],
      ['GET', `/plans/${plan.id}/entries`],
      ['POST', `/plans/${plan.id}/entries`, { date: '2026-10-05', amountCents: 1 }],
      [
        'POST',
        `/plans/${plan.id}/entries/import`,
        { rows: [{ date: '2026-10-05', amountCents: 1, note: '' }] },
      ],
      ['PATCH', `/entries/${entry.id}`, { amountCents: 1 }],
      ['DELETE', `/entries/${entry.id}`],
      ['POST', `/entries/${entry.id}/restore`],
      ['PUT', `/plans/${plan.id}/payouts/2026-10-10`, { paidCents: 1 }],
      ['DELETE', `/plans/${plan.id}/payouts/2026-10-10`],
      ['POST', `/plans/${plan.id}/payouts/bulk`, { through: '2026-12-31' }],
    ]
    for (const [method, path, body] of attempts) {
      const res = await call(method, path, USER_B, body)
      expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 404`)
    }

    // Nothing of A's changed.
    const [week] = await weeksOf(plan.id)
    expect(week).toMatchObject({ grossCents: 1000, payout: { paidCents: 500 } })
    expect((await json<CommissionPlansResponse>('GET', '/plans', USER_A)).plans).toContainEqual(
      expect.objectContaining({ id: plan.id, name: 'Mis ingresos' }),
    )
  })

  it('answers 404 to ids that are not UUIDs', async () => {
    expect((await call('GET', '/plans/1/weeks', USER_A)).status).toBe(404)
    expect((await call('DELETE', '/entries/abc', USER_A)).status).toBe(404)
  })
})

describe('payouts recorded as income', () => {
  /** A plan whose payouts go to a new account, with one week of entries paid on 2026-10-10. */
  async function linkedPlan() {
    const finance = apiClient(database.connectionString)
    const account = await finance.json<Account>('POST', '/accounts', USER_A, {
      name: `Banco ${crypto.randomUUID().slice(0, 6)}`,
      type: 'bank',
      initialBalanceCents: 0,
    })
    const { categories } = await finance.json<CategoriesResponse>('GET', '/categories', USER_A)
    const category = categories.find((c) => c.kind === 'income' && c.name === 'Comisiones')
    const plan = await newPlan()
    await addEntry(plan.id, '2026-10-06', 6000)
    const linked = await json<CommissionPlan>('PATCH', `/plans/${plan.id}`, USER_A, {
      accountId: account.id,
      categoryId: category?.id,
    })
    expect(linked).toMatchObject({ accountId: account.id, categoryId: category?.id })
    const incomeOf = async () =>
      (
        await finance.json<TransactionsResponse>(
          'GET',
          `/transactions?accountId=${account.id}`,
          USER_A,
        )
      ).transactions
    return { finance, account, category, plan: linked, incomeOf }
  }

  it('records the payout in the plan account, and follows what was paid', async () => {
    const { finance, account, category, plan, incomeOf } = await linkedPlan()
    // Paid before Saturday's payday: the money came in today (2026-10-08).
    await json('PUT', `/plans/${plan.id}/payouts/2026-10-10`, USER_A, { paidCents: 3000 })
    const [income, ...others] = await incomeOf()
    expect(others).toEqual([])
    expect(income).toMatchObject({
      kind: 'income',
      date: '2026-10-08',
      amountCents: 3000,
      accountId: account.id,
      toAccountId: null,
      categoryId: category?.id,
      note: 'Mis ingresos',
    })

    // Confirming again with another amount changes the same income.
    await json('PUT', `/plans/${plan.id}/payouts/2026-10-10`, USER_A, { paidCents: 3500 })
    expect((await incomeOf()).map(({ id, amountCents }) => [id, amountCents])).toEqual([
      [income?.id, 3500],
    ])
    const { accounts } = await finance.json<{ accounts: Account[] }>('GET', '/accounts', USER_A)
    expect(accounts.find(({ id }) => id === account.id)?.balanceCents).toBe(3500)

    // Nothing paid, no income; and undoing the payout takes it away too.
    await json('PUT', `/plans/${plan.id}/payouts/2026-10-10`, USER_A, { paidCents: 0 })
    expect(await incomeOf()).toEqual([])
    await json('PUT', `/plans/${plan.id}/payouts/2026-10-10`, USER_A, { paidCents: 2000 })
    expect(await incomeOf()).toHaveLength(1)
    expect((await call('DELETE', `/plans/${plan.id}/payouts/2026-10-10`, USER_A)).status).toBe(204)
    expect(await incomeOf()).toEqual([])
  })

  it('dates a payout confirmed late on its payday', async () => {
    const { plan, incomeOf } = await linkedPlan()
    await addEntry(plan.id, '2026-09-29', 2000)
    await json('PUT', `/plans/${plan.id}/payouts/2026-10-03`, USER_A, { paidCents: 1000 })
    expect((await incomeOf()).map(({ date }) => date)).toEqual(['2026-10-03'])
  })

  it('does not record the weeks marked in bulk', async () => {
    const { plan, incomeOf } = await linkedPlan()
    const bulk = await json<CommissionBulkPayoutResponse>(
      'POST',
      `/plans/${plan.id}/payouts/bulk`,
      USER_A,
      { through: '2026-10-10' },
    )
    expect(bulk.confirmed).toBe(1)
    expect(await incomeOf()).toEqual([])
  })

  it('stops recording when the plan is unlinked, keeping what it already recorded', async () => {
    const { plan, incomeOf } = await linkedPlan()
    await json('PUT', `/plans/${plan.id}/payouts/2026-10-10`, USER_A, { paidCents: 3000 })
    const unlinked = await json<CommissionPlan>('PATCH', `/plans/${plan.id}`, USER_A, {
      accountId: null,
      categoryId: null,
    })
    expect(unlinked).toMatchObject({ accountId: null, categoryId: null })
    await addEntry(plan.id, '2026-10-13', 1000)
    await json('PUT', `/plans/${plan.id}/payouts/2026-10-17`, USER_A, { paidCents: 500 })
    expect((await incomeOf()).map(({ amountCents }) => amountCents)).toEqual([3000])
  })

  it('goes away with its user, payouts and income included', async () => {
    const leaving = '00000000-0000-4000-8000-00000000000c'
    await database.asAdmin((db) => db.exec(`insert into auth.users (id) values ('${leaving}')`))
    const finance = apiClient(database.connectionString)
    const account = await finance.json<Account>('POST', '/accounts', leaving, {
      name: 'Banco',
      type: 'bank',
      initialBalanceCents: 0,
    })
    const { categories } = await finance.json<CategoriesResponse>('GET', '/categories', leaving)
    const plan = await newPlan(leaving)
    await json('PATCH', `/plans/${plan.id}`, leaving, {
      accountId: account.id,
      categoryId: categories.find((c) => c.kind === 'income')?.id,
    })
    await json('POST', `/plans/${plan.id}/entries`, leaving, {
      date: '2026-10-06',
      amountCents: 100,
    })
    await json('PUT', `/plans/${plan.id}/payouts/2026-10-10`, leaving, { paidCents: 50 })

    const left = await database.asAdmin(async (db) => {
      await db.query('delete from auth.users where id = $1', [leaving])
      const { rows } = await db.query<{ n: number }>(
        `select (select count(*) from transactions where user_id = $1)
              + (select count(*) from commission_plans where user_id = $1)
              + (select count(*) from accounts where user_id = $1) as n`,
        [leaving],
      )
      return Number(rows[0]?.n)
    })
    expect(left).toBe(0)
  })

  it("keeps the plan's account and category from being deleted", async () => {
    const { finance, account, category } = await linkedPlan()
    expect((await finance.call('DELETE', `/accounts/${account.id}`, USER_A)).status).toBe(409)
    expect((await finance.call('DELETE', `/categories/${category?.id}`, USER_A)).status).toBe(409)
  })

  it("rejects another user's account, an expense category, or only one of the two", async () => {
    const finance = apiClient(database.connectionString)
    const plan = await newPlan()
    const theirs = await finance.json<Account>('POST', '/accounts', USER_B, {
      name: 'De B',
      type: 'cash',
      initialBalanceCents: 0,
    })
    const mine = await finance.json<Account>('POST', '/accounts', USER_A, {
      name: 'Mía',
      type: 'cash',
      initialBalanceCents: 0,
    })
    const { categories } = await finance.json<CategoriesResponse>('GET', '/categories', USER_A)
    const income = categories.find((c) => c.kind === 'income')?.id
    const expense = categories.find((c) => c.kind === 'expense')?.id

    const foreign = await call('PATCH', `/plans/${plan.id}`, USER_A, {
      accountId: theirs.id,
      categoryId: income,
    })
    expect(await foreign.json()).toMatchObject({
      error: { fields: { accountId: ['Elige una de tus cuentas.'] } },
    })
    const wrongKind = await call('PATCH', `/plans/${plan.id}`, USER_A, {
      accountId: mine.id,
      categoryId: expense,
    })
    expect(await wrongKind.json()).toMatchObject({
      error: { fields: { categoryId: ['Elige una de tus categorías de ingreso.'] } },
    })
    for (const body of [{ accountId: mine.id }, { accountId: mine.id, categoryId: null }]) {
      expect((await call('PATCH', `/plans/${plan.id}`, USER_A, body)).status).toBe(400)
    }
    const [current] = (await json<CommissionPlansResponse>('GET', '/plans', USER_A)).plans.filter(
      ({ id }) => id === plan.id,
    )
    expect(current).toMatchObject({ accountId: null, categoryId: null })
  })
})

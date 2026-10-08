import {
  commissionEntriesQuerySchema,
  commissionEntryInputSchema,
  commissionEntryUpdateSchema,
  commissionImportInputSchema,
  commissionPayoutInputSchema,
  commissionPlanInputSchema,
  commissionPlanUpdateSchema,
  commissionRateInputSchema,
  isDateKey,
  isPayday,
  type CommissionEntriesResponse,
  type CommissionImportResponse,
  type CommissionPlansResponse,
  type CommissionWeeksResponse,
} from '@pf/shared'
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../../env'
import { apiError } from '../../lib/errors'
import { isUuid } from '../../lib/ids'
import { validate } from '../../lib/validation'
import { requireAuth } from '../../middleware/auth'
import { withUserDb } from '../../middleware/db'
import {
  createEntry,
  createPlan,
  deleteEntry,
  deletePayout,
  deleteRate,
  findPlan,
  importEntries,
  listEntries,
  listPlans,
  listWeeks,
  restoreEntry,
  updateEntry,
  updatePlan,
  upsertPayout,
  upsertRate,
} from './repo'

// Plan §8. Another user's plan or entry answers 404, like one that does not exist (plan §9.3).

const planNotFound = (c: Context<AppEnv>) =>
  apiError(c, 404, 'not_found', 'No encontramos ese plan.')
const entryNotFound = (c: Context<AppEnv>) =>
  apiError(c, 404, 'not_found', 'No encontramos ese registro.')

/** The plan of the `:planId` parameter, or null when it is not the user's. */
async function planParam(c: Context<AppEnv>) {
  const planId = c.req.param('planId')
  if (!planId || !isUuid(planId)) return null
  return findPlan(c.var.db, c.var.userId, planId)
}

function entryParam(c: Context<AppEnv>) {
  const entryId = c.req.param('entryId')
  return entryId && isUuid(entryId) ? entryId : null
}

export const commissionRoutes = new Hono<AppEnv>()
  .use(requireAuth, withUserDb)
  .get('/plans', async (c) => {
    const body: CommissionPlansResponse = { plans: await listPlans(c.var.db, c.var.userId) }
    return c.json(body)
  })
  .post('/plans', validate('json', commissionPlanInputSchema), async (c) => {
    return c.json(await createPlan(c.var.db, c.var.userId, c.req.valid('json')), 201)
  })
  .patch('/plans/:planId', validate('json', commissionPlanUpdateSchema), async (c) => {
    const planId = c.req.param('planId')
    const plan = isUuid(planId)
      ? await updatePlan(c.var.db, c.var.userId, planId, c.req.valid('json'))
      : null
    return plan ? c.json(plan) : planNotFound(c)
  })
  .put('/plans/:planId/rates', validate('json', commissionRateInputSchema), async (c) => {
    const plan = await planParam(c)
    if (!plan) return planNotFound(c)
    await upsertRate(c.var.db, c.var.userId, plan.id, c.req.valid('json'))
    return c.json(await findPlan(c.var.db, c.var.userId, plan.id))
  })
  .delete('/plans/:planId/rates/:effectiveFrom', async (c) => {
    const plan = await planParam(c)
    if (!plan) return planNotFound(c)
    const effectiveFrom = c.req.param('effectiveFrom')
    if (!plan.rates.some((rate) => rate.effectiveFrom === effectiveFrom)) {
      return apiError(c, 404, 'not_found', 'No encontramos ese porcentaje.')
    }
    if (!(await deleteRate(c.var.db, c.var.userId, plan.id, effectiveFrom))) {
      return apiError(c, 409, 'last_rate', 'El plan necesita al menos un porcentaje.')
    }
    return c.json(await findPlan(c.var.db, c.var.userId, plan.id))
  })
  .get('/plans/:planId/weeks', async (c) => {
    const plan = await planParam(c)
    if (!plan) return planNotFound(c)
    const body: CommissionWeeksResponse = { weeks: await listWeeks(c.var.db, c.var.userId, plan) }
    return c.json(body)
  })
  .get('/plans/:planId/entries', validate('query', commissionEntriesQuerySchema), async (c) => {
    const plan = await planParam(c)
    if (!plan) return planNotFound(c)
    const { from, to } = c.req.valid('query')
    const range = from && to ? { from, to } : undefined
    const body: CommissionEntriesResponse = {
      entries: await listEntries(c.var.db, c.var.userId, plan.id, range),
    }
    return c.json(body)
  })
  .post('/plans/:planId/entries', validate('json', commissionEntryInputSchema), async (c) => {
    const plan = await planParam(c)
    if (!plan) return planNotFound(c)
    return c.json(await createEntry(c.var.db, c.var.userId, plan.id, c.req.valid('json')), 201)
  })
  .post(
    '/plans/:planId/entries/import',
    validate('json', commissionImportInputSchema),
    async (c) => {
      const plan = await planParam(c)
      if (!plan) return planNotFound(c)
      const body: CommissionImportResponse = await importEntries(
        c.var.db,
        c.var.userId,
        plan.id,
        c.req.valid('json'),
      )
      return c.json(body)
    },
  )
  .patch('/entries/:entryId', validate('json', commissionEntryUpdateSchema), async (c) => {
    const entryId = entryParam(c)
    const entry = entryId
      ? await updateEntry(c.var.db, c.var.userId, entryId, c.req.valid('json'))
      : null
    return entry ? c.json(entry) : entryNotFound(c)
  })
  .delete('/entries/:entryId', async (c) => {
    const entryId = entryParam(c)
    const deleted = entryId ? await deleteEntry(c.var.db, c.var.userId, entryId) : false
    return deleted ? c.body(null, 204) : entryNotFound(c)
  })
  .post('/entries/:entryId/restore', async (c) => {
    const entryId = entryParam(c)
    const entry = entryId ? await restoreEntry(c.var.db, c.var.userId, entryId) : null
    return entry ? c.json(entry) : entryNotFound(c)
  })
  .put(
    '/plans/:planId/payouts/:payday',
    validate('json', commissionPayoutInputSchema),
    async (c) => {
      const plan = await planParam(c)
      if (!plan) return planNotFound(c)
      const payday = c.req.param('payday')
      if (!isDateKey(payday) || !isPayday(payday, plan)) {
        return apiError(c, 400, 'not_a_payday', 'Esa fecha no es un día de pago de este plan.')
      }
      const { paidCents } = c.req.valid('json')
      return c.json(await upsertPayout(c.var.db, c.var.userId, plan, payday, paidCents))
    },
  )
  .delete('/plans/:planId/payouts/:payday', async (c) => {
    const plan = await planParam(c)
    if (!plan) return planNotFound(c)
    const payday = c.req.param('payday')
    const deleted =
      isDateKey(payday) && (await deletePayout(c.var.db, c.var.userId, plan.id, payday))
    return deleted
      ? c.body(null, 204)
      : apiError(c, 404, 'not_found', 'Esa semana no estaba cobrada.')
  })

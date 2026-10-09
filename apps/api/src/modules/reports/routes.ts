import { monthSummaryQuerySchema } from '@pf/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../../env'
import { validate } from '../../lib/validation'
import { requireAuth } from '../../middleware/auth'
import { withUserDb } from '../../middleware/db'
import { monthSummary } from './repo'

// Plan §8. The rest of the reports arrive in phase 7.

export const reportRoutes = new Hono<AppEnv>()
  .use(requireAuth, withUserDb)
  .get('/summary', validate('query', monthSummaryQuerySchema), async (c) => {
    const { month } = c.req.valid('query')
    return c.json(await monthSummary(c.var.db, c.var.userId, month))
  })

import {
  ADMIN_USERS_PAGE_SIZE,
  adminUserListQuerySchema,
  type AdminUserListResponse,
} from '@pf/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../../env'
import { validate } from '../../lib/validation'
import { requireAdmin, requireAuth } from '../../middleware/auth'
import { withUserDb } from '../../middleware/db'
import { listUsers } from './repo'

// Plan §10. Pending for phase 8: require an MFA (aal2) session on every admin route (plan §9.1).
export const adminRoutes = new Hono<AppEnv>()
  .use(requireAuth, withUserDb, requireAdmin)
  .get('/users', validate('query', adminUserListQuerySchema), async (c) => {
    const { q, offset } = c.req.valid('query')
    const body: AdminUserListResponse = await listUsers(c.var.db, {
      search: q || null,
      limit: ADMIN_USERS_PAGE_SIZE,
      offset: offset ?? 0,
    })
    return c.json(body)
  })

import { profileUpdateSchema, type MeResponse, type UserProfile } from '@pf/shared'
import { Hono, type Context } from 'hono'
import type { ProfileRow } from '../../db/schema'
import type { AppEnv } from '../../env'
import { validate } from '../../lib/validation'
import { requireAuth } from '../../middleware/auth'
import { withUserDb } from '../../middleware/db'
import { findOrCreateProfile, updateProfile } from './repo'

function toUserProfile(row: ProfileRow): UserProfile {
  return {
    displayName: row.displayName,
    currency: row.currency,
    locale: row.locale,
    timezone: row.timezone,
    weekStartsOn: row.weekStartsOn,
    onboardedAt: row.onboardedAt?.toISOString() ?? null,
    enabledModules: row.enabledModules,
    theme: row.theme,
  }
}

function meBody(c: Context<AppEnv>, profile: ProfileRow): MeResponse {
  return {
    user: { id: c.var.userId, email: c.var.userEmail },
    role: c.var.userRole,
    profile: toUserProfile(profile),
  }
}

export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth, withUserDb)
  .get('/', async (c) => {
    const profile = await findOrCreateProfile(c.var.db, c.var.userId)
    return c.json(meBody(c, profile))
  })
  .patch('/profile', validate('json', profileUpdateSchema), async (c) => {
    const profile = await updateProfile(c.var.db, c.var.userId, c.req.valid('json'))
    return c.json(meBody(c, profile))
  })

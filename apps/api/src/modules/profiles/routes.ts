import type { MeResponse, UserProfile } from '@pf/shared'
import { Hono } from 'hono'
import type { ProfileRow } from '../../db/schema'
import type { AppEnv } from '../../env'
import { requireAuth } from '../../middleware/auth'
import { withUserDb } from '../../middleware/db'
import { findOrCreateProfile } from './repo'

function toUserProfile(row: ProfileRow): UserProfile {
  return {
    displayName: row.displayName,
    currency: row.currency,
    locale: row.locale,
    timezone: row.timezone,
    weekStartsOn: row.weekStartsOn,
    onboardedAt: row.onboardedAt?.toISOString() ?? null,
  }
}

export const meRoutes = new Hono<AppEnv>().use(requireAuth, withUserDb).get('/', async (c) => {
  const profile = await findOrCreateProfile(c.var.db, c.var.userId)
  const body: MeResponse = {
    user: { id: c.var.userId, email: c.var.userEmail },
    profile: toUserProfile(profile),
  }
  return c.json(body)
})

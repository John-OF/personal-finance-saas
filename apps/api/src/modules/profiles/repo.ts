import { CATEGORY_KINDS, DEFAULT_CATEGORIES, type ProfileUpdate } from '@pf/shared'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { categories, profiles } from '../../db/schema'

/**
 * The user's profile, created with the defaults (and the default categories) on first use. Profiles
 * are created here rather than by a trigger on auth.users because the same Auth users are shared by
 * the `app` and `app_dev` schemas.
 */
export async function findOrCreateProfile(db: Db, userId: string) {
  const [existing] = await db.select().from(profiles).where(eq(profiles.id, userId))
  if (existing) return existing

  // Two first requests can race: the loser inserts nothing and reads the winner's row.
  const [created] = await db
    .insert(profiles)
    .values({ id: userId })
    .onConflictDoNothing()
    .returning()
  if (created) {
    await db
      .insert(categories)
      .values(
        CATEGORY_KINDS.flatMap((kind) =>
          DEFAULT_CATEGORIES[kind].map((name) => ({ userId, kind, name })),
        ),
      )
    return created
  }
  const [raced] = await db.select().from(profiles).where(eq(profiles.id, userId))
  if (!raced) throw new Error('profile not found after insert')
  return raced
}

/** Applies a validated update; finishing the setup wizard keeps the first completion date. */
export async function updateProfile(db: Db, userId: string, update: ProfileUpdate) {
  await findOrCreateProfile(db, userId)
  const { completeOnboarding, ...fields } = update
  const [updated] = await db
    .update(profiles)
    .set({
      ...fields,
      ...(completeOnboarding && { onboardedAt: sql`coalesce(${profiles.onboardedAt}, now())` }),
    })
    .where(eq(profiles.id, userId))
    .returning()
  if (!updated) throw new Error('profile not found for update')
  return updated
}

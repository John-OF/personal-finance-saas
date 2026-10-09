import type { Category, CategoryInput, CategoryUpdate } from '@pf/shared'
import { and, eq, ne, notExists, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { categories, transactions } from '../../db/schema'
import { findOrCreateProfile } from '../profiles/repo'

// Every query filters by the session user besides row-level security (plan §9.3).

/** How far back "most used" looks, for the quick entry. */
const RECENT_DAYS = 90

const categoryColumns = {
  id: categories.id,
  kind: categories.kind,
  name: categories.name,
  archivedAt: categories.archivedAt,
  // Explicit names: in selected fields Drizzle leaves columns unqualified (see accounts/repo.ts).
  recentUseCount: sql<number>`(
    select count(*) from ${transactions} t
    where t.user_id = categories.user_id
      and t.category_id = categories.id
      and t.deleted_at is null
      and t.date >= current_date - ${sql.raw(String(RECENT_DAYS))}
  )`.mapWith(Number),
}

function toCategory({
  archivedAt,
  ...row
}: { archivedAt: Date | null } & Omit<Category, 'archived'>): Category {
  return { ...row, archived: archivedAt !== null }
}

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'es')

export async function listCategories(db: Db, userId: string) {
  // Creates the profile, and with it the default categories, for a user who has none yet.
  await findOrCreateProfile(db, userId)
  const rows = await db
    .select(categoryColumns)
    .from(categories)
    .where(eq(categories.userId, userId))
  return rows.map(toCategory).sort(byName)
}

/** The category, or null when it does not exist or belongs to someone else. */
export async function findCategory(db: Db, userId: string, categoryId: string) {
  const [row] = await db
    .select(categoryColumns)
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
  return row ? toCategory(row) : null
}

/** Null when the user already has a category of that kind with that name (ignoring case). */
export async function createCategory(db: Db, userId: string, input: CategoryInput) {
  await findOrCreateProfile(db, userId)
  const [row] = await db
    .insert(categories)
    .values({ ...input, userId })
    .onConflictDoNothing()
    .returning({ id: categories.id })
  return row ? findCategory(db, userId, row.id) : null
}

/** Whether another category of the same kind already has that name (ignoring case). */
async function nameTaken(db: Db, userId: string, category: Category, name: string) {
  const [taken] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.kind, category.kind),
        ne(categories.id, category.id),
        sql`lower(${categories.name}) = lower(${name})`,
      ),
    )
  return taken !== undefined
}

export async function updateCategory(
  db: Db,
  userId: string,
  categoryId: string,
  { archived, ...fields }: CategoryUpdate,
) {
  const category = await findCategory(db, userId, categoryId)
  if (!category) return 'not_found'
  if (fields.name !== undefined && (await nameTaken(db, userId, category, fields.name))) {
    return 'duplicate'
  }
  await db
    .update(categories)
    .set({
      ...fields,
      ...(archived !== undefined && {
        archivedAt: archived ? sql`coalesce(${categories.archivedAt}, now())` : null,
      }),
    })
    .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
  return (await findCategory(db, userId, categoryId)) ?? 'not_found'
}

/**
 * Deletes a category without transactions (deleted ones count too: "Deshacer" may bring them
 * back). One with transactions can only be archived.
 */
export async function deleteCategory(db: Db, userId: string, categoryId: string) {
  const deleted = await db
    .delete(categories)
    .where(
      and(
        eq(categories.userId, userId),
        eq(categories.id, categoryId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(transactions)
            .where(
              and(eq(transactions.userId, userId), eq(transactions.categoryId, categories.id)),
            ),
        ),
      ),
    )
    .returning({ id: categories.id })
  if (deleted.length > 0) return 'deleted'
  return (await findCategory(db, userId, categoryId)) ? 'in_use' : 'not_found'
}

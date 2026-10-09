import { categoryInputSchema, categoryUpdateSchema, type CategoriesResponse } from '@pf/shared'
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../../env'
import { apiError } from '../../lib/errors'
import { isUuid } from '../../lib/ids'
import { validate } from '../../lib/validation'
import { requireAuth } from '../../middleware/auth'
import { withUserDb } from '../../middleware/db'
import { createCategory, deleteCategory, listCategories, updateCategory } from './repo'

// Plan §8. Another user's category answers 404, like one that does not exist (plan §9.3).

const categoryNotFound = (c: Context<AppEnv>) =>
  apiError(c, 404, 'not_found', 'No encontramos esa categoría.')
const duplicateName = (c: Context<AppEnv>) =>
  apiError(c, 409, 'duplicate_name', 'Ya tienes una categoría con ese nombre.', {
    name: ['Ya tienes una categoría con ese nombre.'],
  })

function categoryParam(c: Context<AppEnv>) {
  const categoryId = c.req.param('categoryId')
  return categoryId && isUuid(categoryId) ? categoryId : null
}

export const categoryRoutes = new Hono<AppEnv>()
  .use(requireAuth, withUserDb)
  .get('/', async (c) => {
    const body: CategoriesResponse = { categories: await listCategories(c.var.db, c.var.userId) }
    return c.json(body)
  })
  .post('/', validate('json', categoryInputSchema), async (c) => {
    const category = await createCategory(c.var.db, c.var.userId, c.req.valid('json'))
    return category ? c.json(category, 201) : duplicateName(c)
  })
  .patch('/:categoryId', validate('json', categoryUpdateSchema), async (c) => {
    const categoryId = categoryParam(c)
    const result = categoryId
      ? await updateCategory(c.var.db, c.var.userId, categoryId, c.req.valid('json'))
      : 'not_found'
    if (result === 'not_found') return categoryNotFound(c)
    if (result === 'duplicate') return duplicateName(c)
    return c.json(result)
  })
  .delete('/:categoryId', async (c) => {
    const categoryId = categoryParam(c)
    const result = categoryId
      ? await deleteCategory(c.var.db, c.var.userId, categoryId)
      : 'not_found'
    if (result === 'in_use') {
      return apiError(
        c,
        409,
        'in_use',
        'Esta categoría tiene movimientos. Archívala para dejar de verla.',
      )
    }
    return result === 'deleted' ? c.body(null, 204) : categoryNotFound(c)
  })

import { transactionInputSchema, transactionsQuerySchema } from '@pf/shared'
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../../env'
import { apiError } from '../../lib/errors'
import { isUuid } from '../../lib/ids'
import { validate } from '../../lib/validation'
import { requireAuth } from '../../middleware/auth'
import { withUserDb } from '../../middleware/db'
import {
  createTransaction,
  decodeCursor,
  deleteTransaction,
  listTransactions,
  referenceErrors,
  restoreTransaction,
  updateTransaction,
} from './repo'

// Plan §8. Another user's transaction answers 404, like one that does not exist (plan §9.3).

const transactionNotFound = (c: Context<AppEnv>) =>
  apiError(c, 404, 'not_found', 'No encontramos ese movimiento.')

function transactionParam(c: Context<AppEnv>) {
  const transactionId = c.req.param('transactionId')
  return transactionId && isUuid(transactionId) ? transactionId : null
}

export const transactionRoutes = new Hono<AppEnv>()
  .use(requireAuth, withUserDb)
  .get('/', validate('query', transactionsQuerySchema), async (c) => {
    const query = c.req.valid('query')
    const cursor = query.cursor ? decodeCursor(query.cursor) : null
    if (query.cursor && !cursor) {
      return apiError(c, 400, 'validation_error', 'Revisa los datos enviados.', {
        cursor: ['No es una página válida.'],
      })
    }
    return c.json(await listTransactions(c.var.db, c.var.userId, query, cursor))
  })
  .post('/', validate('json', transactionInputSchema), async (c) => {
    const input = c.req.valid('json')
    const errors = await referenceErrors(c.var.db, c.var.userId, input)
    if (errors) return apiError(c, 400, 'validation_error', 'Revisa los datos enviados.', errors)
    return c.json(await createTransaction(c.var.db, c.var.userId, input), 201)
  })
  .put('/:transactionId', validate('json', transactionInputSchema), async (c) => {
    const transactionId = transactionParam(c)
    if (!transactionId) return transactionNotFound(c)
    const input = c.req.valid('json')
    const errors = await referenceErrors(c.var.db, c.var.userId, input)
    if (errors) return apiError(c, 400, 'validation_error', 'Revisa los datos enviados.', errors)
    const transaction = await updateTransaction(c.var.db, c.var.userId, transactionId, input)
    return transaction ? c.json(transaction) : transactionNotFound(c)
  })
  .delete('/:transactionId', async (c) => {
    const transactionId = transactionParam(c)
    const deleted = transactionId
      ? await deleteTransaction(c.var.db, c.var.userId, transactionId)
      : false
    return deleted ? c.body(null, 204) : transactionNotFound(c)
  })
  .post('/:transactionId/restore', async (c) => {
    const transactionId = transactionParam(c)
    const transaction = transactionId
      ? await restoreTransaction(c.var.db, c.var.userId, transactionId)
      : null
    return transaction ? c.json(transaction) : transactionNotFound(c)
  })

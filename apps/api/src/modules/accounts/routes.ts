import { accountInputSchema, accountUpdateSchema, type AccountsResponse } from '@pf/shared'
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../../env'
import { apiError } from '../../lib/errors'
import { isUuid } from '../../lib/ids'
import { validate } from '../../lib/validation'
import { requireAuth } from '../../middleware/auth'
import { withUserDb } from '../../middleware/db'
import { createAccount, deleteAccount, listAccounts, updateAccount } from './repo'

// Plan §8. Another user's account answers 404, like one that does not exist (plan §9.3).

const accountNotFound = (c: Context<AppEnv>) =>
  apiError(c, 404, 'not_found', 'No encontramos esa cuenta.')

function accountParam(c: Context<AppEnv>) {
  const accountId = c.req.param('accountId')
  return accountId && isUuid(accountId) ? accountId : null
}

export const accountRoutes = new Hono<AppEnv>()
  .use(requireAuth, withUserDb)
  .get('/', async (c) => {
    const body: AccountsResponse = { accounts: await listAccounts(c.var.db, c.var.userId) }
    return c.json(body)
  })
  .post('/', validate('json', accountInputSchema), async (c) => {
    return c.json(await createAccount(c.var.db, c.var.userId, c.req.valid('json')), 201)
  })
  .patch('/:accountId', validate('json', accountUpdateSchema), async (c) => {
    const accountId = accountParam(c)
    const account = accountId
      ? await updateAccount(c.var.db, c.var.userId, accountId, c.req.valid('json'))
      : null
    return account ? c.json(account) : accountNotFound(c)
  })
  .delete('/:accountId', async (c) => {
    const accountId = accountParam(c)
    const result = accountId ? await deleteAccount(c.var.db, c.var.userId, accountId) : 'not_found'
    if (result === 'in_use') {
      return apiError(
        c,
        409,
        'in_use',
        'Esta cuenta tiene movimientos. Archívala para dejar de verla.',
      )
    }
    return result === 'deleted' ? c.body(null, 204) : accountNotFound(c)
  })

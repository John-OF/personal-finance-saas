import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import { z } from 'zod'
import { apiError } from './errors'

/** zValidator with the API's error shape: 400 validation_error with per-field messages. */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const { fieldErrors } = z.flattenError(result.error)
      return apiError(c, 400, 'validation_error', 'Revisa los datos enviados.', fieldErrors)
    }
  })
}

import { z } from 'zod'

/** Field errors for a form, using the same schema the API validates with; null when valid. */
export function formErrors(schema: z.ZodType, values: unknown): Record<string, string[]> | null {
  const result = schema.safeParse(values)
  if (result.success) return null
  return z.flattenError(result.error).fieldErrors
}

import type { ApiErrorBody } from '@pf/shared'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
) {
  const body: ApiErrorBody = { error: fields ? { code, message, fields } : { code, message } }
  return c.json(body, status)
}

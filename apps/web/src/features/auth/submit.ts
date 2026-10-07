import { ApiError } from '../../lib/api'

export type FieldErrors = Record<string, string[]>

/** What a failed submit should show: a general message and, when the API sent them, field errors. */
export function describeFailure(err: unknown): { message: string; fields: FieldErrors } {
  if (err instanceof ApiError) return { message: err.message, fields: err.fields ?? {} }
  return { message: 'No se pudo conectar con el servidor. Revisa tu conexión.', fields: {} }
}

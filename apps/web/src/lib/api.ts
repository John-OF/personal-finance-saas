import type { ApiErrorBody } from '@pf/shared'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let sessionLost: (() => void) | null = null

/**
 * Registers what to do when the API says there is no session: it expired, or it was ended from
 * another device (signing out everywhere, changing the password). Set by SessionProvider.
 */
export function onSessionLost(handler: (() => void) | null) {
  sessionLost = handler
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
}

/** Calls the same-origin API. The session travels in httpOnly cookies, never in JavaScript. */
export async function api<T>(path: string, { method = 'GET', body }: ApiOptions = {}): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  const res = await fetch(`/api/v1${path}`, init)
  if (res.status === 204) return undefined as T

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = (data as ApiErrorBody | null)?.error
    if (error?.code === 'unauthenticated' || error?.code === 'session_ended') sessionLost?.()
    throw new ApiError(
      res.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'Ocurrió un error inesperado.',
      error?.fields,
    )
  }
  return data as T
}

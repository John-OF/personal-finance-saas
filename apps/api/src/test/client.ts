import { app } from '../app'
import { createExecutionContext, createTestEnv, TEST_USER_HEADER } from './app'

/**
 * Calls the API as a test user (none: without a session), sending the body as JSON. Kept apart from
 * test/app.ts, which the session mock imports before the app exists.
 */
export function apiClient(connectionString: string) {
  async function call(method: string, path: string, userId?: string, body?: unknown) {
    const { ctx, settle } = createExecutionContext()
    const headers: Record<string, string> = { Origin: 'http://localhost' }
    const init: RequestInit = { method, headers }
    if (userId) headers[TEST_USER_HEADER] = userId
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const res = await app.request(`/api/v1${path}`, init, createTestEnv(connectionString), ctx)
    await settle()
    return res
  }

  /** The JSON of a successful answer; anything else fails the test with the API's error. */
  async function json<T>(method: string, path: string, userId: string, body?: unknown) {
    const res = await call(method, path, userId, body)
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
    return res.json<T>()
  }

  return { call, json }
}

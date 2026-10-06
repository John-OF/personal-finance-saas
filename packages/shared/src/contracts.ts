import { z } from 'zod'

/** Request and response shapes shared by the API and the web app. */

export const loginInputSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
})
export type LoginInput = z.infer<typeof loginInputSchema>

export interface SessionUser {
  id: string
  email: string | null
}

export interface SessionResponse {
  user: SessionUser
}

export interface HealthResponse {
  status: 'ok'
  time: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    fields?: Record<string, string[]>
  }
}

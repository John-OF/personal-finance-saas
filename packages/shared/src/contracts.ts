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

/** Preferences the user can change. Role and account status live elsewhere (plan §7.8). */
export interface UserProfile {
  displayName: string | null
  /** ISO 4217 code, e.g. `USD`. */
  currency: string
  /** BCP 47 tag, e.g. `es-EC`. */
  locale: string
  /** IANA time zone, e.g. `America/Guayaquil`. */
  timezone: string
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekStartsOn: number
  /** ISO timestamp of when the setup wizard was finished, or null. */
  onboardedAt: string | null
}

export type UserRole = 'user' | 'admin'

export interface MeResponse {
  user: SessionUser
  role: UserRole
  profile: UserProfile
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

import { z } from 'zod'

/** Request and response shapes shared by the API and the web app. */

/** Plan §9.1. Supabase Auth must have the same minimum (Authentication → Providers → Email). */
export const PASSWORD_MIN_LENGTH = 10
/** bcrypt, used by Supabase Auth, only looks at the first 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72

const emailSchema = z.email({ error: 'Escribe un correo válido.' }).max(254)

/** For new passwords; logging in accepts any length so older passwords keep working. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.` })
  .max(PASSWORD_MAX_LENGTH, { error: `Usa como mucho ${PASSWORD_MAX_LENGTH} caracteres.` })

/** Turnstile token; absent while the captcha is not configured. */
const captchaTokenSchema = z.string().min(1).max(4096).optional()

/** `token_hash` from the links in Supabase's emails. */
const tokenHashSchema = z.string().min(1).max(512)

export const loginInputSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, { error: 'Escribe tu contraseña.' }).max(256),
  captchaToken: captchaTokenSchema,
})
export type LoginInput = z.infer<typeof loginInputSchema>

export const signupInputSchema = z.strictObject({
  email: emailSchema,
  password: newPasswordSchema,
  captchaToken: captchaTokenSchema,
})
export type SignupInput = z.infer<typeof signupInputSchema>

export const forgotPasswordInputSchema = z.strictObject({
  email: emailSchema,
  captchaToken: captchaTokenSchema,
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>

export const verifyEmailInputSchema = z.strictObject({
  tokenHash: tokenHashSchema,
})
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>

export const resetPasswordInputSchema = z.strictObject({
  tokenHash: tokenHashSchema,
  password: newPasswordSchema,
})
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>

/**
 * Answer to signup and password recovery. Always the same, whether or not the email is registered,
 * so the API does not reveal which accounts exist.
 */
export interface EmailSentResponse {
  status: 'email_sent'
}

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

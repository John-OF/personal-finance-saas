import {
  forgotPasswordInputSchema,
  loginInputSchema,
  resetPasswordInputSchema,
  signupInputSchema,
  verifyEmailInputSchema,
  type EmailSentResponse,
  type SessionResponse,
} from '@pf/shared'
import type { AuthError, User } from '@supabase/supabase-js'
import { Hono, type Context } from 'hono'
import type { AppEnv } from '../env'
import { apiError } from '../lib/errors'
import { createSupabase } from '../lib/supabase'
import { validate } from '../lib/validation'
import { requireAuth } from '../middleware/auth'
import { limitAuthByIp } from '../middleware/rate-limit'

const EMAIL_SENT: EmailSentResponse = { status: 'email_sent' }

/** Only passes the Turnstile token when there is one (the captcha may not be configured yet). */
function captcha(captchaToken: string | undefined) {
  return captchaToken ? { captchaToken } : {}
}

function sessionBody(user: User): SessionResponse {
  return { user: { id: user.id, email: user.email ?? null } }
}

/**
 * Where the links in Supabase's emails send the user back to. The Origin header was already checked
 * by requireSameOrigin (it is the app itself or the Vite dev server); Supabase only honours URLs in
 * its redirect allowlist.
 */
function appUrl(c: Context<AppEnv>, path: string) {
  return `${c.req.header('Origin') ?? new URL(c.req.url).origin}${path}`
}

/** Errors any Supabase Auth call can return, mapped to the API's error shape. */
function authFailure(c: Context<AppEnv>, error: AuthError, action: string) {
  if (error.code === 'captcha_failed') {
    return apiError(
      c,
      400,
      'captcha_failed',
      'No pudimos comprobar que no eres un robot. Inténtalo de nuevo.',
    )
  }
  if (error.status === 429) {
    return apiError(c, 429, 'rate_limited', 'Demasiados intentos. Espera unos minutos.')
  }
  console.error(`auth_${action}_failed`, { status: error.status, code: error.code })
  return apiError(
    c,
    502,
    'auth_unavailable',
    'No se pudo completar la operación. Inténtalo de nuevo.',
  )
}

function weakPassword(c: Context<AppEnv>) {
  const message = 'Elige una contraseña más segura.'
  return apiError(c, 400, 'weak_password', message, { password: [message] })
}

function invalidLink(c: Context<AppEnv>) {
  return apiError(c, 400, 'link_invalid', 'El enlace no es válido o ya caducó. Pide uno nuevo.')
}

export const authRoutes = new Hono<AppEnv>()
  .post('/login', limitAuthByIp('login'), validate('json', loginInputSchema), async (c) => {
    const { email, password, captchaToken } = c.req.valid('json')
    const { data, error } = await createSupabase(c).auth.signInWithPassword({
      email,
      password,
      options: captcha(captchaToken),
    })

    if (error) {
      // Supabase uses the same code for unknown email and wrong password, so we do not reveal
      // which accounts exist.
      if (error.code === 'invalid_credentials') {
        return apiError(c, 401, 'invalid_credentials', 'Correo o contraseña incorrectos.')
      }
      if (error.code === 'email_not_confirmed') {
        return apiError(c, 403, 'email_not_confirmed', 'Confirma tu correo antes de entrar.')
      }
      if (error.code === 'user_banned') {
        return apiError(c, 403, 'account_suspended', 'Tu cuenta está suspendida.')
      }
      return authFailure(c, error, 'login')
    }

    return c.json(sessionBody(data.user))
  })
  .post('/signup', limitAuthByIp('signup'), validate('json', signupInputSchema), async (c) => {
    const { email, password, captchaToken } = c.req.valid('json')
    const { error } = await createSupabase(c).auth.signUp({
      email,
      password,
      options: { emailRedirectTo: appUrl(c, '/auth/confirm'), ...captcha(captchaToken) },
    })

    if (error) {
      // With email confirmation on, Supabase answers an existing email like a new one; if it ever
      // says so explicitly, we still answer the same so accounts cannot be discovered.
      if (error.code === 'user_already_exists' || error.code === 'email_exists') {
        return c.json(EMAIL_SENT, 202)
      }
      if (error.code === 'weak_password') return weakPassword(c)
      if (error.code === 'email_address_invalid') {
        return apiError(c, 400, 'validation_error', 'Revisa los datos enviados.', {
          email: ['No podemos enviar correos a esta dirección.'],
        })
      }
      if (error.code === 'signup_disabled') {
        return apiError(c, 403, 'signup_disabled', 'El registro está cerrado por ahora.')
      }
      return authFailure(c, error, 'signup')
    }

    return c.json(EMAIL_SENT, 202)
  })
  .post(
    '/verify-email',
    limitAuthByIp('verify'),
    validate('json', verifyEmailInputSchema),
    async (c) => {
      const { tokenHash } = c.req.valid('json')
      const { data, error } = await createSupabase(c).auth.verifyOtp({
        type: 'email',
        token_hash: tokenHash,
      })

      if (error) {
        if (error.status === 429) return authFailure(c, error, 'verify_email')
        return invalidLink(c)
      }
      if (!data.user) return invalidLink(c)
      // The confirmed user is now signed in: the session cookies were written by verifyOtp.
      return c.json(sessionBody(data.user))
    },
  )
  .post(
    '/forgot-password',
    limitAuthByIp('recover'),
    validate('json', forgotPasswordInputSchema),
    async (c) => {
      const { email, captchaToken } = c.req.valid('json')
      const { error } = await createSupabase(c).auth.resetPasswordForEmail(email, {
        redirectTo: appUrl(c, '/auth/reset-password'),
        ...captcha(captchaToken),
      })

      // Same answer whether or not the email is registered; only the captcha and rate limits,
      // which do not depend on the account, are reported.
      if (error && (error.code === 'captcha_failed' || error.status === 429)) {
        return authFailure(c, error, 'forgot_password')
      }
      if (error)
        console.error('auth_forgot_password_failed', { status: error.status, code: error.code })
      return c.json(EMAIL_SENT, 202)
    },
  )
  .post(
    '/reset-password',
    limitAuthByIp('reset'),
    validate('json', resetPasswordInputSchema),
    async (c) => {
      const { tokenHash, password } = c.req.valid('json')
      const supabase = createSupabase(c)
      const verified = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
      if (verified.error) {
        if (verified.error.status === 429) return authFailure(c, verified.error, 'reset_password')
        return invalidLink(c)
      }
      if (!verified.data.user) return invalidLink(c)

      // Same client: it already holds the recovery session that verifyOtp created.
      const { data, error } = await supabase.auth.updateUser({ password })
      if (error) {
        // The link is spent either way. Choosing the current password again is harmless: the user
        // proved the email is theirs and knows that password, so they stay signed in. Any other
        // failure closes the recovery session so nothing is left half done.
        if (error.code === 'same_password') return c.json(sessionBody(verified.data.user))
        await supabase.auth.signOut({ scope: 'local' })
        if (error.code === 'weak_password') {
          return apiError(
            c,
            400,
            'weak_password',
            'Elige una contraseña más segura y pide un enlace nuevo: este ya se usó.',
          )
        }
        return authFailure(c, error, 'reset_password')
      }
      return c.json(sessionBody(data.user))
    },
  )
  .post('/logout', async (c) => {
    // Revokes this session's refresh token and clears the cookies. Idempotent.
    await createSupabase(c).auth.signOut({ scope: 'local' })
    return c.body(null, 204)
  })
  .get('/session', requireAuth, (c) => {
    const body: SessionResponse = { user: { id: c.var.userId, email: c.var.userEmail } }
    return c.json(body)
  })

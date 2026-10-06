import { loginInputSchema, type SessionResponse } from '@pf/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { apiError } from '../lib/errors'
import { createSupabase } from '../lib/supabase'
import { validate } from '../lib/validation'
import { limitAuthByIp } from '../middleware/rate-limit'

export const authRoutes = new Hono<AppEnv>()
  .post('/login', limitAuthByIp('login'), validate('json', loginInputSchema), async (c) => {
    const { email, password } = c.req.valid('json')
    const { data, error } = await createSupabase(c).auth.signInWithPassword({ email, password })

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
      if (error.status === 429) {
        return apiError(c, 429, 'rate_limited', 'Demasiados intentos. Espera unos minutos.')
      }
      console.error('auth_login_failed', { status: error.status, code: error.code })
      return apiError(c, 502, 'auth_unavailable', 'No se pudo iniciar sesión. Inténtalo de nuevo.')
    }

    const body: SessionResponse = { user: { id: data.user.id, email: data.user.email ?? null } }
    return c.json(body)
  })
  .post('/logout', async (c) => {
    // Revokes this session's refresh token and clears the cookies. Idempotent.
    await createSupabase(c).auth.signOut({ scope: 'local' })
    return c.body(null, 204)
  })
  .get('/session', async (c) => {
    // Verifies the JWT (locally when the project uses asymmetric signing keys) and refreshes it
    // when it has expired, rewriting the cookies.
    const { data, error } = await createSupabase(c).auth.getClaims()
    if (error || !data) return apiError(c, 401, 'unauthenticated', 'Inicia sesión.')

    const { sub, email } = data.claims
    const body: SessionResponse = { user: { id: sub, email: email ?? null } }
    return c.json(body)
  })

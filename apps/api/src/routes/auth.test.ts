import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app'
import { createExecutionContext, createTestEnv, TEST_USER_HEADER } from '../test/app'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  verifyOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ createSupabase: () => ({ auth }) }))
vi.mock('../lib/session', async () => (await import('../test/app')).mockSession())

const ORIGIN = 'http://localhost'
const USER = { id: '00000000-0000-4000-8000-00000000000a', email: 'ana@example.com' }
const GOOD_PASSWORD = 'una-clave-larga'

function authError(code: string, status = 400) {
  return { data: { user: null, session: null }, error: { code, status, message: code } }
}

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset()
  auth.signOut.mockResolvedValue({ error: null })
})

/** POST as an anonymous visitor, or as `userId` (whose session email is `<last char>@example.com`). */
async function post(path: string, body: unknown, userId?: string) {
  const { ctx } = createExecutionContext()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: ORIGIN }
  if (userId) headers[TEST_USER_HEADER] = userId
  return app.request(
    `/api/v1/auth${path}`,
    { method: 'POST', headers, body: JSON.stringify(body) },
    createTestEnv('postgresql://unused@127.0.0.1:1/db'),
    ctx,
  )
}

describe('POST /signup', () => {
  it('rejects a short password with a message for the form', async () => {
    const res = await post('/signup', { email: 'ana@example.com', password: 'corta' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: { code: 'validation_error', fields: { password: ['Usa al menos 10 caracteres.'] } },
    })
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('asks Supabase to send the confirmation email back to the app', async () => {
    auth.signUp.mockResolvedValue({ data: { user: USER, session: null }, error: null })
    const res = await post('/signup', {
      email: 'ana@example.com',
      password: GOOD_PASSWORD,
      captchaToken: 'turnstile-token',
    })
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ status: 'email_sent' })
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: GOOD_PASSWORD,
      options: { emailRedirectTo: `${ORIGIN}/auth/confirm`, captchaToken: 'turnstile-token' },
    })
  })

  it('leaves the captcha token out when there is none', async () => {
    auth.signUp.mockResolvedValue({ data: { user: USER, session: null }, error: null })
    await post('/signup', { email: 'ana@example.com', password: GOOD_PASSWORD })
    const [options] = auth.signUp.mock.calls.map(
      ([args]) => (args as { options: Record<string, unknown> }).options,
    )
    expect(options).toEqual({ emailRedirectTo: `${ORIGIN}/auth/confirm` })
  })

  it('answers an already registered email like a new one', async () => {
    auth.signUp.mockResolvedValue(authError('user_already_exists', 422))
    const res = await post('/signup', { email: 'ana@example.com', password: GOOD_PASSWORD })
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ status: 'email_sent' })
  })

  it.each([
    ['weak_password', 422, 400, 'weak_password'],
    ['captcha_failed', 400, 400, 'captcha_failed'],
    ['over_email_send_rate_limit', 429, 429, 'rate_limited'],
    ['signup_disabled', 422, 403, 'signup_disabled'],
    ['email_address_not_authorized', 400, 502, 'auth_unavailable'],
  ])('maps the Supabase error %s', async (code, status, expectedStatus, expectedCode) => {
    auth.signUp.mockResolvedValue(authError(code, status))
    const res = await post('/signup', { email: 'ana@example.com', password: GOOD_PASSWORD })
    expect(res.status).toBe(expectedStatus)
    expect(await res.json()).toMatchObject({ error: { code: expectedCode } })
  })
})

describe('POST /verify-email', () => {
  it('confirms the email and signs the user in', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: USER, session: {} }, error: null })
    const res = await post('/verify-email', { tokenHash: 'abc' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: USER })
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'abc' })
  })

  it('reports an expired or used link', async () => {
    auth.verifyOtp.mockResolvedValue(authError('otp_expired', 403))
    const res = await post('/verify-email', { tokenHash: 'abc' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'link_invalid' } })
  })
})

describe('POST /forgot-password', () => {
  it('asks Supabase to send the reset email back to the app', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    const res = await post('/forgot-password', { email: 'ana@example.com' })
    expect(res.status).toBe(202)
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', {
      redirectTo: `${ORIGIN}/auth/reset-password`,
    })
  })

  it('gives the same answer when Supabase fails for that email', async () => {
    auth.resetPasswordForEmail.mockResolvedValue(authError('user_not_found', 404))
    const res = await post('/forgot-password', { email: 'nadie@example.com' })
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ status: 'email_sent' })
  })

  it('reports a failed captcha', async () => {
    auth.resetPasswordForEmail.mockResolvedValue(authError('captcha_failed'))
    const res = await post('/forgot-password', { email: 'ana@example.com', captchaToken: 'x' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'captcha_failed' } })
  })
})

describe('POST /reset-password', () => {
  it('sets the new password and leaves the user signed in', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: USER, session: {} }, error: null })
    auth.updateUser.mockResolvedValue({ data: { user: USER }, error: null })
    const res = await post('/reset-password', { tokenHash: 'abc', password: GOOD_PASSWORD })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: USER })
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'abc' })
    expect(auth.updateUser).toHaveBeenCalledWith({ password: GOOD_PASSWORD })
  })

  it('validates the password before spending the link', async () => {
    const res = await post('/reset-password', { tokenHash: 'abc', password: 'corta' })
    expect(res.status).toBe(400)
    expect(auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('does not change anything with an invalid link', async () => {
    auth.verifyOtp.mockResolvedValue(authError('otp_expired', 403))
    const res = await post('/reset-password', { tokenHash: 'abc', password: GOOD_PASSWORD })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'link_invalid' } })
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('keeps the user signed in when they chose their current password', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: USER, session: {} }, error: null })
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'same_password' } })
    const res = await post('/reset-password', { tokenHash: 'abc', password: GOOD_PASSWORD })
    expect(res.status).toBe(200)
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('closes the recovery session when Supabase rejects the password', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: USER, session: {} }, error: null })
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'weak_password', status: 422 },
    })
    const res = await post('/reset-password', { tokenHash: 'abc', password: GOOD_PASSWORD })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'weak_password' } })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})

describe('POST /login', () => {
  it('passes the captcha token to Supabase', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: USER, session: {} }, error: null })
    const res = await post('/login', {
      email: 'ana@example.com',
      password: 'x',
      captchaToken: 'turnstile-token',
    })
    expect(res.status).toBe(200)
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'x',
      options: { captchaToken: 'turnstile-token' },
    })
  })
})

describe('POST /change-password', () => {
  const input = { currentPassword: 'la-clave-de-antes', password: GOOD_PASSWORD, captchaToken: 't' }

  function signInSucceeds(user = USER) {
    auth.signInWithPassword.mockResolvedValue({ data: { user, session: {} }, error: null })
  }

  it('requires a session', async () => {
    expect((await post('/change-password', input)).status).toBe(401)
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it.each([
    ['without the current password', { ...input, currentPassword: '' }, 'currentPassword'],
    ['with a short new password', { ...input, password: 'corta' }, 'password'],
    ['reusing the current password', { ...input, password: input.currentPassword }, 'password'],
  ])('rejects a request %s before calling Supabase', async (_case, body, field) => {
    const res = await post('/change-password', body, USER.id)
    expect(res.status).toBe(400)
    const { error } = await res.json<{ error: { fields: Record<string, string[]> } }>()
    expect(Object.keys(error.fields)).toEqual([field])
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('checks the current password, sets the new one and ends the other sessions', async () => {
    signInSucceeds()
    auth.updateUser.mockResolvedValue({ data: { user: USER }, error: null })
    const res = await post('/change-password', input, USER.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'password_changed', otherSessionsClosed: true })
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: input.currentPassword,
      options: { captchaToken: 't' },
    })
    expect(auth.updateUser).toHaveBeenCalledWith({ password: GOOD_PASSWORD })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('changes nothing when the current password is wrong', async () => {
    auth.signInWithPassword.mockResolvedValue(authError('invalid_credentials'))
    const res = await post('/change-password', input, USER.id)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'invalid_current_password',
        fields: { currentPassword: ['La contraseña actual no es correcta.'] },
      },
    })
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('reports a failed captcha', async () => {
    auth.signInWithPassword.mockResolvedValue(authError('captcha_failed'))
    const res = await post('/change-password', input, USER.id)
    expect(await res.json()).toMatchObject({ error: { code: 'captcha_failed' } })
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('reports a password Supabase finds too weak, keeping the other sessions', async () => {
    signInSucceeds()
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'weak_password', status: 422 },
    })
    const res = await post('/change-password', input, USER.id)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'weak_password' } })
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('says so when the other sessions could not be ended', async () => {
    signInSucceeds()
    auth.updateUser.mockResolvedValue({ data: { user: USER }, error: null })
    auth.signOut.mockResolvedValue({ error: { status: 500, code: 'unexpected_failure' } })
    const res = await post('/change-password', input, USER.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'password_changed', otherSessionsClosed: false })
  })

  it('drops the new session if the email now belongs to another account', async () => {
    signInSucceeds({ id: '00000000-0000-4000-8000-0000000000ff', email: 'a@example.com' })
    const res = await post('/change-password', input, USER.id)
    expect(res.status).toBe(401)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(auth.updateUser).not.toHaveBeenCalled()
  })
})

describe('POST /logout-all', () => {
  it('requires a session', async () => {
    expect((await post('/logout-all', {})).status).toBe(401)
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('ends every session of the user', async () => {
    const res = await post('/logout-all', {}, USER.id)
    expect(res.status).toBe(204)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('reports when Supabase could not end them', async () => {
    auth.signOut.mockResolvedValue({ error: { status: 500, code: 'unexpected_failure' } })
    const res = await post('/logout-all', {}, USER.id)
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: { code: 'auth_unavailable' } })
  })
})

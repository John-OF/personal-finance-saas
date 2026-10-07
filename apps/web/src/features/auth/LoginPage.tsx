import { loginInputSchema, type SessionResponse } from '@pf/shared'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSession } from '../../app/session-context'
import { AuthCard, FormAlert, SubmitButton, TextField } from '../../components/ui/form'
import { api } from '../../lib/api'
import { Turnstile } from './Turnstile'
import { useAuthForm } from './useAuthForm'

export function LoginPage() {
  const { setUser } = useSession()
  const navigate = useNavigate()
  const form = useAuthForm()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await form.submit(loginInputSchema, { email, password }, (body) =>
      api<SessionResponse>('/auth/login', { method: 'POST', body }),
    )
    if (result) {
      setUser(result.user)
      void navigate('/', { replace: true })
    }
  }

  return (
    <AuthCard title="Iniciar sesión">
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        <TextField
          label="Correo"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          errors={form.fields.email}
        />
        <TextField
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          errors={form.fields.password}
        />
        <Turnstile key={form.captcha.key} action="login" onToken={form.captcha.onToken} />
        {form.error && <FormAlert>{form.error}</FormAlert>}
        <SubmitButton busy={form.busy} disabled={!form.captcha.ready} busyLabel="Entrando…">
          Entrar
        </SubmitButton>
      </form>
      <nav className="flex flex-col gap-1 text-sm">
        <Link to="/forgot-password" className="text-brand underline">
          ¿Olvidaste tu contraseña?
        </Link>
        <span>
          ¿No tienes cuenta?{' '}
          <Link to="/signup" className="text-brand underline">
            Crear cuenta
          </Link>
        </span>
      </nav>
    </AuthCard>
  )
}

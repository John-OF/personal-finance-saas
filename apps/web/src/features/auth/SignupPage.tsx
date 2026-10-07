import { PASSWORD_MIN_LENGTH, signupInputSchema, type EmailSentResponse } from '@pf/shared'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AuthCard, FormAlert, SubmitButton, TextField } from '../../components/ui/form'
import { api } from '../../lib/api'
import { Turnstile } from './Turnstile'
import { useAuthForm } from './useAuthForm'

export function SignupPage() {
  const form = useAuthForm()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const mismatch = password !== repeat ? { repeat: ['Las contraseñas no coinciden.'] } : {}
    const result = await form.submit(
      signupInputSchema,
      { email, password },
      (body) => api<EmailSentResponse>('/auth/signup', { method: 'POST', body }),
      mismatch,
    )
    if (result) setSentTo(email)
  }

  if (sentTo) {
    return (
      <AuthCard title="Revisa tu correo">
        <p>
          Si <strong>{sentTo}</strong> puede registrarse, te llegará un enlace para activar la
          cuenta. Ábrelo en este u otro dispositivo; si no lo ves en unos minutos, revisa la carpeta
          de spam.
        </p>
        <Link to="/login" className="text-sm text-brand underline">
          Volver a iniciar sesión
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Crear cuenta">
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
          label={`Contraseña (mínimo ${PASSWORD_MIN_LENGTH} caracteres)`}
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          errors={form.fields.password}
        />
        <TextField
          label="Repite la contraseña"
          name="repeat"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          errors={form.fields.repeat}
        />
        <Turnstile key={form.captcha.key} action="signup" onToken={form.captcha.onToken} />
        {form.error && <FormAlert>{form.error}</FormAlert>}
        <SubmitButton busy={form.busy} disabled={!form.captcha.ready} busyLabel="Creando…">
          Crear cuenta
        </SubmitButton>
      </form>
      <p className="text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="text-brand underline">
          Inicia sesión
        </Link>
      </p>
    </AuthCard>
  )
}

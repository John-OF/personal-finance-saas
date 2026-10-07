import { forgotPasswordInputSchema, type EmailSentResponse } from '@pf/shared'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AuthCard, FormAlert, SubmitButton, TextField } from '../../components/ui/form'
import { api } from '../../lib/api'
import { Turnstile } from './Turnstile'
import { useAuthForm } from './useAuthForm'

export function ForgotPasswordPage() {
  const form = useAuthForm()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await form.submit(forgotPasswordInputSchema, { email }, (body) =>
      api<EmailSentResponse>('/auth/forgot-password', { method: 'POST', body }),
    )
    if (result) setSent(true)
  }

  if (sent) {
    return (
      <AuthCard title="Revisa tu correo">
        <p>
          Si hay una cuenta con <strong>{email}</strong>, te enviamos un enlace para elegir una
          contraseña nueva. Caduca en una hora y solo sirve una vez.
        </p>
        <Link to="/login" className="text-sm text-brand underline">
          Volver a iniciar sesión
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Recuperar contraseña">
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        <TextField
          label="Correo de tu cuenta"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          errors={form.fields.email}
        />
        <Turnstile key={form.captcha.key} action="recover" onToken={form.captcha.onToken} />
        {form.error && <FormAlert>{form.error}</FormAlert>}
        <SubmitButton busy={form.busy} disabled={!form.captcha.ready} busyLabel="Enviando…">
          Enviar enlace
        </SubmitButton>
      </form>
      <Link to="/login" className="text-sm text-brand underline">
        Volver a iniciar sesión
      </Link>
    </AuthCard>
  )
}

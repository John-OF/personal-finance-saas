import { PASSWORD_MIN_LENGTH, resetPasswordInputSchema, type SessionResponse } from '@pf/shared'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useSession } from '../../app/session-context'
import { AuthCard, FormAlert, SubmitButton, TextField } from '../../components/ui/form'
import { api } from '../../lib/api'
import { useAuthForm } from './useAuthForm'

/** Target of the link in the password recovery email. */
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash')
  const { setUser } = useSession()
  const navigate = useNavigate()
  const form = useAuthForm()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const mismatch = password !== repeat ? { repeat: ['Las contraseñas no coinciden.'] } : {}
    const result = await form.submit(
      resetPasswordInputSchema,
      { tokenHash, password },
      (body) => api<SessionResponse>('/auth/reset-password', { method: 'POST', body }),
      mismatch,
    )
    if (result) {
      setUser(result.user)
      void navigate('/', { replace: true })
    }
  }

  if (!tokenHash) {
    return (
      <AuthCard title="Enlace incompleto">
        <p>Abre el enlace completo del correo que te enviamos, o pide uno nuevo.</p>
        <Link to="/forgot-password" className="text-sm text-link underline">
          Pedir un enlace nuevo
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Elegir una contraseña nueva">
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        <TextField
          label={`Contraseña nueva (mínimo ${PASSWORD_MIN_LENGTH} caracteres)`}
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
        {form.error && <FormAlert>{form.error}</FormAlert>}
        <SubmitButton busy={form.busy} busyLabel="Guardando…">
          Guardar y entrar
        </SubmitButton>
      </form>
      {form.error && (
        <Link to="/forgot-password" className="text-sm text-link underline">
          Pedir un enlace nuevo
        </Link>
      )}
    </AuthCard>
  )
}

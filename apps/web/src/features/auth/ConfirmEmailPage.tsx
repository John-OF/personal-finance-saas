import type { SessionResponse } from '@pf/shared'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useSession } from '../../app/session-context'
import { AuthCard, FormAlert } from '../../components/ui/form'
import { api } from '../../lib/api'
import { describeFailure } from './submit'

/**
 * Target of the link in the confirmation email. It waits for a click instead of confirming on load:
 * mail scanners open links on their own and would spend the single-use token.
 */
export function ConfirmEmailPage() {
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash')
  const { setUser } = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm(token: string) {
    setBusy(true)
    setError(null)
    try {
      const { user } = await api<SessionResponse>('/auth/verify-email', {
        method: 'POST',
        body: { tokenHash: token },
      })
      setUser(user)
      void navigate('/', { replace: true })
    } catch (err) {
      setError(describeFailure(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (!tokenHash) {
    return (
      <AuthCard title="Enlace incompleto">
        <p>Abre el enlace completo del correo que te enviamos.</p>
        <Link to="/login" className="text-sm text-link underline">
          Ir a iniciar sesión
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Confirmar tu correo">
      <p>Pulsa el botón para activar tu cuenta y entrar.</p>
      {error && <FormAlert>{error}</FormAlert>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void confirm(tokenHash)}
        className="rounded bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Confirmando…' : 'Confirmar mi correo'}
      </button>
      {error && (
        <Link to="/login" className="text-sm text-link underline">
          Ir a iniciar sesión
        </Link>
      )}
    </AuthCard>
  )
}

import type { MeResponse } from '@pf/shared'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '../../app/session-context'
import { FormAlert } from '../../components/ui/form'
import { ApiError, api } from '../../lib/api'

/** Temporary home: proves the session and the database work together until the dashboard exists. */
export function HomePage() {
  const { user, setUser } = useSession()
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<MeResponse>('/me').then(setMe, (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar tu perfil.'),
    )
  }, [])

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    setUser(null)
    void navigate('/login', { replace: true })
  }

  return (
    <section className="flex flex-col gap-4 rounded border border-line bg-card p-5">
      <p>
        Hola, <strong>{user?.email}</strong>.
      </p>
      {error && <FormAlert>{error}</FormAlert>}
      {!me && !error && <p className="text-muted">Cargando tu perfil…</p>}
      {me && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Moneda</dt>
          <dd>{me.profile.currency}</dd>
          <dt className="text-muted">Zona horaria</dt>
          <dd>{me.profile.timezone}</dd>
          <dt className="text-muted">Idioma</dt>
          <dd>{me.profile.locale}</dd>
          {me.role === 'admin' && (
            <>
              <dt className="text-muted">Rol</dt>
              <dd>Administrador</dd>
            </>
          )}
        </dl>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        className="self-start rounded bg-ink px-4 py-2 text-paper hover:bg-brand"
      >
        Cerrar sesión
      </button>
    </section>
  )
}

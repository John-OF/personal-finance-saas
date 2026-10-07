import type { MeResponse } from '@pf/shared'
import { useEffect, useState } from 'react'
import { useSession } from '../../app/session-context'
import { FormAlert } from '../../components/ui/form'
import { ApiError, api } from '../../lib/api'

/** Temporary home until the dashboard exists: greets the user and shows their profile. */
export function HomePage() {
  const { user } = useSession()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<MeResponse>('/me').then(setMe, (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar tu perfil.'),
    )
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl">
        Hola{me?.profile.displayName ? `, ${me.profile.displayName}` : ''}
      </h2>

      <section className="flex flex-col gap-4 rounded border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">{user?.email}</p>
        {error && <FormAlert>{error}</FormAlert>}
        {!me && !error && <p className="text-muted-foreground">Cargando tu perfil…</p>}
        {me && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Moneda</dt>
            <dd>{me.profile.currency}</dd>
            <dt className="text-muted-foreground">Zona horaria</dt>
            <dd>{me.profile.timezone}</dd>
            <dt className="text-muted-foreground">Idioma</dt>
            <dd>{me.profile.locale}</dd>
            {me.role === 'admin' && (
              <>
                <dt className="text-muted-foreground">Rol</dt>
                <dd>Administrador</dd>
              </>
            )}
          </dl>
        )}
      </section>
    </div>
  )
}

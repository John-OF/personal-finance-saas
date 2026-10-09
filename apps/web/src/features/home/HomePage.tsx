import { Navigate } from 'react-router'
import { useMe } from '../../app/me-context'
import { homePath, MODULES } from '../../lib/modules'
import { SummaryView } from '../finances/SummaryView'

/**
 * The summary of the month with the finances module. Without it, a greeting and the user's setup
 * until the other modules bring their own summaries; users of a single module with its own page go
 * straight there.
 */
export function HomePage() {
  const { me } = useMe()
  const { profile } = me
  const modules = MODULES.filter(({ id }) => profile.enabledModules.includes(id))
  const home = homePath(profile.enabledModules)
  if (home !== '/') return <Navigate to={home} replace />
  if (profile.enabledModules.includes('finances')) return <SummaryView />

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl">Hola{profile.displayName ? `, ${profile.displayName}` : ''}</h2>

      <section className="flex flex-col gap-4 rounded border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Aquí aparecerá el resumen de tu mes cuando lleguen los primeros módulos.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Moneda</dt>
          <dd>{profile.currency}</dd>
          <dt className="text-muted-foreground">Zona horaria</dt>
          <dd>{profile.timezone.replaceAll('_', ' ')}</dd>
          <dt className="text-muted-foreground">Módulos</dt>
          <dd>{modules.map(({ label }) => label).join(', ')}</dd>
          {me.role === 'admin' && (
            <>
              <dt className="text-muted-foreground">Rol</dt>
              <dd>Administrador</dd>
            </>
          )}
        </dl>
      </section>
    </div>
  )
}

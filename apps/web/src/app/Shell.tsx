import type { HealthResponse } from '@pf/shared'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, Outlet } from 'react-router'
import { api } from '../lib/api'
import { useSession } from './session-context'

type ApiStatus = 'checking' | 'ok' | 'down'

/** Page frame shared by every route. */
export function Shell() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    api<HealthResponse>('/health').then(
      () => setApiStatus('ok'),
      () => setApiStatus('down'),
    )
  }, [])

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          <Link to="/">Libreta</Link>
        </h1>
        <ApiBadge status={apiStatus} />
      </header>
      <Outlet />
    </main>
  )
}

function ApiBadge({ status }: { status: ApiStatus }) {
  const label = { checking: 'API…', ok: 'API en línea', down: 'API sin respuesta' }[status]
  const color = { checking: 'text-muted', ok: 'text-brand', down: 'text-danger' }[status]
  return <span className={`text-sm ${color}`}>{label}</span>
}

function CheckingSession() {
  return <p className="text-muted">Comprobando la sesión…</p>
}

/** Pages that need a session send signed-out visitors to the login page. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { user } = useSession()
  if (user === undefined) return <CheckingSession />
  if (user === null) return <Navigate to="/login" replace />
  return children
}

/** Login and signup make no sense with a session: go home instead. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useSession()
  if (user === undefined) return <CheckingSession />
  if (user) return <Navigate to="/" replace />
  return children
}

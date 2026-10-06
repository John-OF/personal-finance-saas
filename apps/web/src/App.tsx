import type { HealthResponse, MeResponse, SessionResponse, SessionUser } from '@pf/shared'
import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, api } from './lib/api'

type ApiStatus = 'checking' | 'ok' | 'down'

/** Temporary shell: proves the SPA, the API, the session and the database work together. */
export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')
  // undefined = still checking the session
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)

  useEffect(() => {
    api<HealthResponse>('/health').then(
      () => setApiStatus('ok'),
      () => setApiStatus('down'),
    )
    api<SessionResponse>('/auth/session').then(
      ({ user }) => setUser(user),
      () => setUser(null),
    )
  }, [])

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    setUser(null)
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Billetera</h1>
        <ApiBadge status={apiStatus} />
      </header>

      <section className="rounded border border-line bg-card p-5">
        {user === undefined && <p className="text-muted">Comprobando la sesión…</p>}
        {user === null && <LoginForm onLogin={setUser} />}
        {user && <SignedIn user={user} onLogout={() => void logout()} />}
      </section>
    </main>
  )
}

function SignedIn({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<MeResponse>('/me').then(setMe, (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar tu perfil.'),
    )
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <p>
        Hola, <strong>{user.email}</strong>.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!me && !error && <p className="text-muted">Cargando tu perfil…</p>}
      {me && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Moneda</dt>
          <dd>{me.profile.currency}</dd>
          <dt className="text-muted">Zona horaria</dt>
          <dd>{me.profile.timezone}</dd>
          <dt className="text-muted">Idioma</dt>
          <dd>{me.profile.locale}</dd>
        </dl>
      )}
      <button
        type="button"
        onClick={onLogout}
        className="self-start rounded bg-ink px-4 py-2 text-paper hover:bg-brand"
      >
        Cerrar sesión
      </button>
    </div>
  )
}

function ApiBadge({ status }: { status: ApiStatus }) {
  const label = { checking: 'API…', ok: 'API en línea', down: 'API sin respuesta' }[status]
  const color = { checking: 'text-muted', ok: 'text-brand', down: 'text-danger' }[status]
  return <span className={`text-sm ${color}`}>{label}</span>
}

function LoginForm({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { user } = await api<SessionResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      onLogin(user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Iniciar sesión</h2>
      <label className="flex flex-col gap-1 text-sm">
        Correo
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-line bg-white px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Contraseña
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-line bg-white px-3 py-2 text-base"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-ink px-4 py-2 text-paper hover:bg-brand disabled:opacity-50"
      >
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}

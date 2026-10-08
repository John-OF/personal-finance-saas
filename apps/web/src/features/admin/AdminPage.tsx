import type { AdminUser, AdminUserListResponse } from '@pf/shared'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useMe } from '../../app/me-context'
import { FormAlert } from '../../components/ui/form'
import { api } from '../../lib/api'
import { MODULES } from '../../lib/modules'
import { describeFailure } from '../auth/submit'

function usersPath(search: string, offset: number) {
  const params = new URLSearchParams()
  if (search) params.set('q', search)
  if (offset > 0) params.set('offset', String(offset))
  const query = params.toString()
  return `/admin/users${query ? `?${query}` : ''}`
}

/** Dates in the admin's own locale and time zone. */
function useDateFormats() {
  const { locale, timezone } = useMe().me.profile
  return useMemo(() => {
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: timezone })
    const dateTime = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    })
    return {
      date: (iso: string) => date.format(new Date(iso)),
      dateTime: (iso: string) => dateTime.format(new Date(iso)),
    }
  }, [locale, timezone])
}

const BADGE_TONES = {
  primary: 'border-primary text-primary',
  danger: 'border-destructive text-destructive',
  muted: 'border-border text-muted-foreground',
}

function Badge({ tone, children }: { tone: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  )
}

function UserItem({ user }: { user: AdminUser }) {
  const { date, dateTime } = useDateFormats()
  const { profile } = user
  const modules = MODULES.filter(({ id }) => profile?.enabledModules.includes(id))

  let profileState = 'Aún no creado'
  if (profile?.onboardedAt) profileState = `Completo desde el ${date(profile.onboardedAt)}`
  else if (profile) profileState = 'Asistente sin terminar'

  return (
    <li className="flex flex-col gap-2 border-t border-border py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-all">{user.email ?? 'Sin correo'}</span>
        {user.role === 'admin' && <Badge tone="primary">Administrador</Badge>}
        {user.status === 'suspended' && <Badge tone="danger">Suspendida</Badge>}
        {!user.emailConfirmedAt && <Badge tone="muted">Correo sin confirmar</Badge>}
      </div>
      {profile?.displayName && <p className="text-sm">{profile.displayName}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Registro</dt>
        <dd>{user.createdAt ? date(user.createdAt) : '—'}</dd>
        <dt className="text-muted-foreground">Último ingreso</dt>
        <dd>{user.lastSignInAt ? dateTime(user.lastSignInAt) : 'Nunca'}</dd>
        <dt className="text-muted-foreground">Perfil</dt>
        <dd>{profileState}</dd>
        {profile && (
          <>
            <dt className="text-muted-foreground">Módulos</dt>
            <dd>{modules.map(({ label }) => label).join(', ')}</dd>
          </>
        )}
      </dl>
    </li>
  )
}

/** A submitted search. Each submit is a new object, so repeating a search reloads it. */
interface Query {
  search: string
}

interface Loaded {
  query: Query
  list?: AdminUserListResponse
  error?: string
}

function UsersSection() {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState<Query>({ search: '' })
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [moreBusy, setMoreBusy] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)

  useEffect(() => {
    // A slower answer to an older search must not replace the current one.
    let current = true
    api<AdminUserListResponse>(usersPath(query.search, 0)).then(
      (list) => {
        if (current) setLoaded({ query, list })
      },
      (err: unknown) => {
        if (current) setLoaded({ query, error: describeFailure(err).message })
      },
    )
    return () => {
      current = false
    }
  }, [query])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMoreError(null)
    setQuery({ search: draft.trim() })
  }

  // Until the current query is answered, the previous results are not shown.
  const answer: Partial<Loaded> = loaded?.query === query ? loaded : {}
  const { list, error } = answer
  const { search } = query

  async function loadMore() {
    if (!list) return
    setMoreBusy(true)
    setMoreError(null)
    try {
      const page = await api<AdminUserListResponse>(usersPath(search, list.users.length))
      setLoaded((prev) => {
        if (prev?.query !== query || !prev.list) return prev
        // Someone may have signed up since the first page, shifting the offsets.
        const seen = new Set(prev.list.users.map(({ id }) => id))
        const users = [...prev.list.users, ...page.users.filter(({ id }) => !seen.has(id))]
        return { query, list: { users, total: page.users.length > 0 ? page.total : users.length } }
      })
    } catch (err) {
      setMoreError(describeFailure(err).message)
    } finally {
      setMoreBusy(false)
    }
  }

  let summary = ''
  if (list) {
    const noun = search ? 'resultado' : 'usuario'
    summary = `${list.total} ${noun}${list.total === 1 ? '' : 's'}`
  }

  return (
    <section className="flex flex-col gap-4 rounded border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-lg">Usuarios</h3>
        <span className="text-sm text-muted-foreground">{summary}</span>
      </div>

      <form role="search" onSubmit={onSubmit} className="flex gap-2">
        <label htmlFor="admin-user-search" className="sr-only">
          Buscar por correo o nombre
        </label>
        <input
          id="admin-user-search"
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Correo o nombre"
          maxLength={100}
          className="min-w-0 flex-1 rounded border border-input bg-card px-3 py-2 text-base"
        />
        <button
          type="submit"
          className="flex items-center gap-2 rounded border border-border px-4 py-2 hover:bg-muted"
        >
          <Search aria-hidden className="size-4" />
          Buscar
        </button>
      </form>

      {error && <FormAlert>{error}</FormAlert>}
      {!list && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {list?.users.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {search ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay usuarios.'}
        </p>
      )}
      {list && list.users.length > 0 && (
        <ul className="flex flex-col">
          {list.users.map((user) => (
            <UserItem key={user.id} user={user} />
          ))}
        </ul>
      )}

      {list && list.users.length < list.total && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={moreBusy}
          className="self-start rounded border border-border px-4 py-2 hover:bg-muted disabled:opacity-50"
        >
          {moreBusy ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
      {moreError && <FormAlert>{moreError}</FormAlert>}
    </section>
  )
}

/** Plan §10. Only account metadata: the admin never sees anyone's finances. */
export function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl">Administración</h2>
      <UsersSection />
    </div>
  )
}

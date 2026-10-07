import type { ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { useMe } from './me-context'
import { MeProvider } from './MeProvider'
import { NAV_ITEMS } from './nav'
import { useSession } from './session-context'

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 text-xl font-heading">
      <span aria-hidden className="size-2.5 rounded-full bg-primary" />
      Libreta
    </Link>
  )
}

function CheckingSession() {
  return <p className="p-6 text-muted-foreground">Comprobando la sesión…</p>
}

/**
 * Every signed-in route: sends signed-out visitors to the login page, loads the profile, and keeps
 * users who have not finished the setup wizard on /welcome.
 */
export function SignedIn() {
  const { user } = useSession()
  if (user === undefined) return <CheckingSession />
  if (user === null) return <Navigate to="/login" replace />
  return (
    <MeProvider>
      <OnboardingGate />
    </MeProvider>
  )
}

function OnboardingGate() {
  const { me } = useMe()
  const { pathname } = useLocation()
  const onboarded = me.profile.onboardedAt !== null
  if (!onboarded && pathname !== '/welcome') return <Navigate to="/welcome" replace />
  if (onboarded && pathname === '/welcome') return <Navigate to="/" replace />
  return <Outlet />
}

/** Signed-in pages: header, tabs on wide screens and a bottom bar on phones. */
export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 pt-4 pb-3 md:pb-0">
          <Brand />
        </div>
        <nav aria-label="Secciones" className="mx-auto hidden max-w-3xl gap-1 px-4 md:flex">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end ?? false}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-3 py-2.5 text-sm tracking-wide uppercase ${
                  isActive
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Bottom padding leaves room for the phone navigation bar. */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 md:pb-10">
        <Outlet />
      </main>

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto flex max-w-md justify-around">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end ?? false}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2 text-xs ${
                    isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
                  }`
                }
              >
                <Icon aria-hidden className="size-6" strokeWidth={1.75} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** Signed-out pages and the targets of the email links: a single centred card. */
export function GuestLayout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-10">
      <header>
        <Brand />
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

/** Login and signup make no sense with a session: go home instead. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useSession()
  if (user === undefined) return <CheckingSession />
  if (user) return <Navigate to="/" replace />
  return children
}

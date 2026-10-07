import type { SessionResponse, SessionUser } from '@pf/shared'
import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { SessionContext } from './session-context'

/** Checks the session cookie once on load; the pages update it on login, logout and signup. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)

  useEffect(() => {
    api<SessionResponse>('/auth/session').then(
      ({ user }) => setUser(user),
      () => setUser(null),
    )
  }, [])

  return <SessionContext value={{ user, setUser }}>{children}</SessionContext>
}

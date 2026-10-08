import type { SessionResponse, SessionUser } from '@pf/shared'
import { useEffect, useState, type ReactNode } from 'react'
import { api, onSessionLost } from '../lib/api'
import { SessionContext } from './session-context'

/**
 * Checks the session cookie once on load; the pages update it on login, logout and signup, and any
 * API call that finds the session gone signs the user out here (back to the login page).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)

  useEffect(() => {
    onSessionLost(() => setUser(null))
    return () => onSessionLost(null)
  }, [])

  useEffect(() => {
    api<SessionResponse>('/auth/session').then(
      ({ user }) => setUser(user),
      () => setUser(null),
    )
  }, [])

  return <SessionContext value={{ user, setUser }}>{children}</SessionContext>
}

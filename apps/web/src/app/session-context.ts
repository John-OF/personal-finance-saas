import type { SessionUser } from '@pf/shared'
import { createContext, use } from 'react'

export interface SessionState {
  /** undefined while the session is being checked, null when signed out. */
  user: SessionUser | null | undefined
  setUser: (user: SessionUser | null) => void
}

export const SessionContext = createContext<SessionState | null>(null)

export function useSession() {
  const session = use(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}

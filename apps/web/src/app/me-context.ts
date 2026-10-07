import type { MeResponse, ProfileUpdate } from '@pf/shared'
import { createContext, use } from 'react'

export interface MeState {
  me: MeResponse
  /** Saves a profile change and refreshes `me`; throws ApiError on validation errors. */
  updateProfile: (update: ProfileUpdate) => Promise<MeResponse>
}

export const MeContext = createContext<MeState | null>(null)

/** The signed-in user's profile; only available under the SignedIn route. */
export function useMe() {
  const state = use(MeContext)
  if (!state) throw new Error('useMe must be used inside MeProvider')
  return state
}

import { useEffect, useState, type ReactNode } from 'react'
import {
  applyThemePreference,
  followSystemMode,
  readThemePreference,
  storeThemePreference,
  type ThemePreference,
} from '../lib/theme'
import { ThemeContext } from './theme-context'

/** Holds the theme choice; public/theme-init.js already applied the stored one before React. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(readThemePreference)

  useEffect(() => {
    applyThemePreference(preference)
    if (preference.mode !== 'system') return
    return followSystemMode(() => applyThemePreference(preference))
  }, [preference])

  function setPreference(next: ThemePreference) {
    storeThemePreference(next)
    setPreferenceState(next)
  }

  return <ThemeContext value={{ preference, setPreference }}>{children}</ThemeContext>
}

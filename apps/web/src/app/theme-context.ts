import { createContext, use } from 'react'
import type { ThemePreference } from '../lib/theme'

export interface ThemeState {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeState | null>(null)

export function useTheme() {
  const theme = use(ThemeContext)
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider')
  return theme
}

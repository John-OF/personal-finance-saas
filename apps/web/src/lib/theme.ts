// Theme and light/dark mode. The choice is kept in localStorage so public/theme-init.js can apply
// it before the first paint (no flash), and in the profile so it follows the user to other devices.
// Keep the storage key and the theme ids in sync with public/theme-init.js (checked by
// scripts/check-contrast.mjs).
import {
  THEME_IDS,
  THEME_MODES,
  type ThemeId,
  type ThemeMode,
  type ThemePreference,
} from '@pf/shared'

export type { ThemePreference }

const THEME_LABELS: Record<ThemeId, string> = {
  libreta: 'Libreta',
  cobalto: 'Cobalto',
  malva: 'Malva',
  neutro: 'Neutro',
  contraste: 'Alto contraste',
}
export const THEMES = THEME_IDS.map((id) => ({ id, label: THEME_LABELS[id] }))

const MODE_LABELS: Record<ThemeMode, string> = {
  system: 'Como el sistema',
  light: 'Claro',
  dark: 'Oscuro',
}
export const MODES = THEME_MODES.map((id) => ({ id, label: MODE_LABELS[id] }))

export const DEFAULT_THEME: ThemePreference = { theme: 'libreta', mode: 'system' }
const STORAGE_KEY = 'libreta.theme'

function isThemeId(value: unknown): value is ThemeId {
  return THEME_IDS.some((id) => id === value)
}

function isMode(value: unknown): value is ThemeMode {
  return THEME_MODES.some((id) => id === value)
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<
      Record<keyof ThemePreference, unknown>
    > | null
    return {
      theme: isThemeId(stored?.theme) ? stored.theme : DEFAULT_THEME.theme,
      mode: isMode(stored?.mode) ? stored.mode : DEFAULT_THEME.mode,
    }
  } catch {
    // Private mode or blocked storage: fall back to the defaults.
    return DEFAULT_THEME
  }
}

export function storeThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preference))
  } catch {
    // Not persisted; the choice still applies until the page is closed.
  }
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function resolvedMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return darkQuery().matches ? 'dark' : 'light'
}

export function applyThemePreference({ theme, mode }: ThemePreference) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.dataset.mode = resolvedMode(mode)
}

/** Re-applies the theme when the system switches between light and dark. Returns the unsubscribe. */
export function followSystemMode(onChange: () => void) {
  const query = darkQuery()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

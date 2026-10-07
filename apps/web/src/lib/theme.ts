// Theme and light/dark mode. The choice is kept in localStorage so public/theme-init.js can apply
// it before the first paint (no flash); keep the key and the values in sync with that file.

export const THEMES = [
  { id: 'libreta', label: 'Libreta' },
  { id: 'cobalto', label: 'Cobalto' },
  { id: 'neutro', label: 'Neutro' },
  { id: 'contraste', label: 'Alto contraste' },
] as const
export type ThemeId = (typeof THEMES)[number]['id']

export const MODES = [
  { id: 'system', label: 'Como el sistema' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
] as const
export type ModePreference = (typeof MODES)[number]['id']

export interface ThemePreference {
  theme: ThemeId
  mode: ModePreference
}

export const DEFAULT_THEME: ThemePreference = { theme: 'libreta', mode: 'system' }
const STORAGE_KEY = 'libreta.theme'

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some(({ id }) => id === value)
}

function isMode(value: unknown): value is ModePreference {
  return MODES.some(({ id }) => id === value)
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

export function resolvedMode(mode: ModePreference): 'light' | 'dark' {
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

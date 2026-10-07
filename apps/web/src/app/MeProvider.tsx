import type { MeResponse, ProfileUpdate } from '@pf/shared'
import { useEffect, useState, type ReactNode } from 'react'
import { ApiError, api } from '../lib/api'
import { MeContext } from './me-context'
import { useTheme } from './theme-context'

/**
 * Loads the profile once for every signed-in page. The theme saved in the profile wins over the
 * browser's stored one, so the choice follows the user to other devices.
 */
export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const { preference, setPreference } = useTheme()

  useEffect(() => {
    api<MeResponse>('/me').then(setMe, (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar tu perfil.'),
    )
  }, [attempt])

  const saved = me?.profile.theme
  useEffect(() => {
    if (saved && (saved.theme !== preference.theme || saved.mode !== preference.mode)) {
      setPreference(saved)
    }
    // Only when the saved theme changes: local changes are saved to the profile by Settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.theme, saved?.mode])

  async function updateProfile(update: ProfileUpdate) {
    const updated = await api<MeResponse>('/me/profile', { method: 'PATCH', body: update })
    setMe(updated)
    return updated
  }

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert" className="text-destructive">
          {error}
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setAttempt((n) => n + 1)
          }}
          className="rounded border border-border px-4 py-2 hover:bg-muted"
        >
          Reintentar
        </button>
      </div>
    )
  }
  if (!me) return <p className="p-6 text-muted-foreground">Cargando…</p>

  return <MeContext value={{ me, updateProfile }}>{children}</MeContext>
}

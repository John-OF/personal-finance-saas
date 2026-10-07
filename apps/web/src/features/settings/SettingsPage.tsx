import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useSession } from '../../app/session-context'
import { useTheme } from '../../app/theme-context'
import { api } from '../../lib/api'
import { MODES, resolvedMode, THEMES } from '../../lib/theme'

export function SettingsPage() {
  const { user, setUser } = useSession()
  const { preference, setPreference } = useTheme()
  const navigate = useNavigate()
  // The previews follow the mode in use, so each card shows how the theme will really look.
  const previewMode = resolvedMode(preference.mode)

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    setUser(null)
    void navigate('/login', { replace: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl">Ajustes</h2>

      <section className="flex flex-col gap-3 rounded border border-border bg-card p-5">
        <h3 className="text-lg">Apariencia</h3>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-muted-foreground">Tema</legend>
          <div className="grid grid-cols-2 gap-3">
            {THEMES.map(({ id, label }) => (
              <label
                key={id}
                className="flex cursor-pointer flex-col gap-2 rounded border border-border p-2 has-checked:border-primary has-checked:ring-2 has-checked:ring-ring"
              >
                <span
                  data-theme={id}
                  data-mode={previewMode}
                  aria-hidden
                  className="flex h-14 items-end gap-1.5 rounded border border-border bg-background p-2"
                >
                  <span className="h-full flex-1 rounded-sm bg-card" />
                  <span className="h-1/2 w-3 rounded-sm bg-primary" />
                  <span className="h-1/3 w-3 rounded-sm bg-accent" />
                  <span className="h-2/3 w-3 rounded-sm bg-destructive" />
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="theme"
                    value={id}
                    checked={preference.theme === id}
                    onChange={() => setPreference({ ...preference, theme: id })}
                    className="accent-primary"
                  />
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-muted-foreground">Modo</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {MODES.map(({ id, label }) => (
              <label key={id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  value={id}
                  checked={preference.mode === id}
                  onChange={() => setPreference({ ...preference, mode: id })}
                  className="accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="flex flex-col gap-3 rounded border border-border bg-card p-5">
        <h3 className="text-lg">Cuenta</h3>
        <p className="text-sm">
          Has entrado como <strong>{user?.email}</strong>.
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex items-center gap-2 self-start rounded border border-border px-4 py-2 hover:bg-muted"
        >
          <LogOut aria-hidden className="size-4" />
          Cerrar sesión
        </button>
      </section>
    </div>
  )
}

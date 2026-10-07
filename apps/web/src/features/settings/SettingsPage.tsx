import type { ModuleId, ProfileUpdate, ThemePreference } from '@pf/shared'
import { LogOut } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useMe } from '../../app/me-context'
import { useSession } from '../../app/session-context'
import { useTheme } from '../../app/theme-context'
import { FormAlert } from '../../components/ui/form'
import { api } from '../../lib/api'
import { describeFailure, type FieldErrors } from '../auth/submit'
import { ModulePicker, ProfileFields, ThemePicker, type ProfileValues } from './fields'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded border border-border bg-card p-5">
      <h3 className="text-lg">{title}</h3>
      {children}
    </section>
  )
}

/** Save state of one settings form: busy, saved message, general and field errors. */
function useSave() {
  const { updateProfile } = useMe()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldErrors>({})

  async function save(update: ProfileUpdate) {
    setBusy(true)
    setSaved(false)
    setError(null)
    setFields({})
    try {
      await updateProfile(update)
      setSaved(true)
    } catch (err) {
      const failure = describeFailure(err)
      setError(failure.message)
      setFields(failure.fields)
    } finally {
      setBusy(false)
    }
  }

  return { busy, saved, error, fields, save, edited: () => setSaved(false) }
}

function SaveRow({ busy, saved, error }: { busy: boolean; saved: boolean; error: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Guardando…' : 'Guardar'}
      </button>
      {saved && <FormAlert tone="info">Guardado.</FormAlert>}
      {error && <FormAlert>{error}</FormAlert>}
    </div>
  )
}

function ProfileSection() {
  const { me } = useMe()
  const status = useSave()
  const [values, setValues] = useState<ProfileValues>({
    displayName: me.profile.displayName ?? '',
    currency: me.profile.currency,
    timezone: me.profile.timezone,
    weekStartsOn: me.profile.weekStartsOn,
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void status.save({ ...values, displayName: values.displayName.trim() || null })
  }

  return (
    <Section title="Perfil">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <ProfileFields
          values={values}
          onChange={(next) => {
            setValues(next)
            status.edited()
          }}
          errors={status.fields}
        />
        <SaveRow {...status} />
      </form>
    </Section>
  )
}

function ModulesSection() {
  const { me } = useMe()
  const status = useSave()
  const [modules, setModules] = useState<ModuleId[]>(me.profile.enabledModules)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void status.save({ enabledModules: modules })
  }

  return (
    <Section title="Módulos">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Solo verás en el menú lo que actives. Tus datos se conservan aunque desactives un módulo.
        </p>
        <ModulePicker
          value={modules}
          onChange={(next) => {
            setModules(next)
            status.edited()
          }}
          errors={status.fields.enabledModules}
        />
        <SaveRow {...status} />
      </form>
    </Section>
  )
}

function AppearanceSection() {
  const { preference, setPreference } = useTheme()
  const { updateProfile } = useMe()
  const [error, setError] = useState<string | null>(null)

  function change(next: ThemePreference) {
    // Applied at once; saved in the background so it follows the user to other devices.
    setPreference(next)
    setError(null)
    updateProfile({ theme: next }).catch(() =>
      setError('Se aplicó en este dispositivo, pero no se pudo guardar en tu cuenta.'),
    )
  }

  return (
    <Section title="Apariencia">
      <ThemePicker value={preference} onChange={change} />
      {error && <FormAlert>{error}</FormAlert>}
    </Section>
  )
}

function AccountSection() {
  const { user, setUser } = useSession()
  const navigate = useNavigate()

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    setUser(null)
    void navigate('/login', { replace: true })
  }

  return (
    <Section title="Cuenta">
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
    </Section>
  )
}

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl">Ajustes</h2>
      <ProfileSection />
      <ModulesSection />
      <AppearanceSection />
      <AccountSection />
    </div>
  )
}

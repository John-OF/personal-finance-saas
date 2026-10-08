import {
  changePasswordInputSchema,
  PASSWORD_MIN_LENGTH,
  type ModuleId,
  type PasswordChangedResponse,
  type ProfileUpdate,
  type ThemePreference,
} from '@pf/shared'
import { LogOut } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useMe } from '../../app/me-context'
import { useSession } from '../../app/session-context'
import { useTheme } from '../../app/theme-context'
import { FormAlert, SubmitButton, TextField } from '../../components/ui/form'
import { api } from '../../lib/api'
import { describeFailure, type FieldErrors } from '../auth/submit'
import { Turnstile } from '../auth/Turnstile'
import { useAuthForm } from '../auth/useAuthForm'
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

const secondaryButton =
  'flex items-center gap-2 self-start rounded border border-border px-4 py-2 hover:bg-muted disabled:opacity-50'

/** Collapsed until asked for, so the captcha only loads when the password is really changing. */
function PasswordSection() {
  const form = useAuthForm()
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [result, setResult] = useState<PasswordChangedResponse | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    const mismatch = password !== repeat ? { repeat: ['Las contraseñas no coinciden.'] } : {}
    const changed = await form.submit(
      changePasswordInputSchema,
      { currentPassword, password },
      (body) => api<PasswordChangedResponse>('/auth/change-password', { method: 'POST', body }),
      mismatch,
    )
    if (changed) {
      setResult(changed)
      setOpen(false)
      setCurrentPassword('')
      setPassword('')
      setRepeat('')
    }
  }

  return (
    <Section title="Contraseña">
      {result?.otherSessionsClosed && (
        <FormAlert tone="info">
          Contraseña cambiada. Cerramos la sesión en tus otros dispositivos.
        </FormAlert>
      )}
      {result && !result.otherSessionsClosed && (
        <FormAlert>
          Contraseña cambiada, pero no pudimos cerrar la sesión en tus otros dispositivos. Usa
          «Cerrar sesión en todos los dispositivos».
        </FormAlert>
      )}
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setResult(null)
          }}
          className={secondaryButton}
        >
          Cambiar contraseña
        </button>
      ) : (
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
          <TextField
            label="Contraseña actual"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            errors={form.fields.currentPassword}
          />
          <TextField
            label={`Contraseña nueva (mínimo ${PASSWORD_MIN_LENGTH} caracteres)`}
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            errors={form.fields.password}
          />
          <TextField
            label="Repite la contraseña nueva"
            name="repeat"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            errors={form.fields.repeat}
          />
          <p className="text-sm text-muted-foreground">
            Al cambiarla se cierra la sesión en tus otros dispositivos.
          </p>
          <Turnstile
            key={form.captcha.key}
            action="change_password"
            onToken={form.captcha.onToken}
          />
          {form.error && <FormAlert>{form.error}</FormAlert>}
          <div className="flex flex-wrap gap-3">
            <SubmitButton busy={form.busy} disabled={!form.captcha.ready} busyLabel="Guardando…">
              Cambiar contraseña
            </SubmitButton>
            <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </Section>
  )
}

function AccountSection() {
  const { user, setUser } = useSession()
  const navigate = useNavigate()
  const [confirmingAll, setConfirmingAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function logout(path: '/auth/logout' | '/auth/logout-all') {
    setBusy(true)
    setError(null)
    try {
      await api(path, { method: 'POST' })
      setUser(null)
      void navigate('/login', { replace: true })
    } catch (err) {
      setError(describeFailure(err).message)
      setBusy(false)
    }
  }

  return (
    <Section title="Cuenta">
      <p className="text-sm">
        Has entrado como <strong>{user?.email}</strong>.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void logout('/auth/logout')}
        className={secondaryButton}
      >
        <LogOut aria-hidden className="size-4" />
        Cerrar sesión
      </button>
      {!confirmingAll ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmingAll(true)}
          className={secondaryButton}
        >
          Cerrar sesión en todos los dispositivos
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded border border-border p-4">
          <p className="text-sm">
            Saldrás de Libreta aquí y en todos tus otros dispositivos, y tendrás que volver a entrar
            en cada uno. Úsalo si perdiste un dispositivo o entraste en uno ajeno.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void logout('/auth/logout-all')}
              className="rounded bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Cerrando…' : 'Sí, cerrar en todos'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingAll(false)}
              className={secondaryButton}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <FormAlert>{error}</FormAlert>}
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
      <PasswordSection />
      <AccountSection />
    </div>
  )
}

import { isTimeZone, profileUpdateSchema, type ModuleId, type ProfileUpdate } from '@pf/shared'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useMe } from '../../app/me-context'
import { useTheme } from '../../app/theme-context'
import { FormAlert } from '../../components/ui/form'
import { browserTimeZone } from '../../lib/locale-options'
import { describeFailure, type FieldErrors } from '../auth/submit'
import { ModulePicker, ProfileFields, ThemePicker, type ProfileValues } from '../settings/fields'

const STEPS = [
  { title: 'Te damos la bienvenida', fields: ['displayName'] },
  { title: 'Tu moneda y tu zona horaria', fields: ['currency', 'timezone', 'weekStartsOn'] },
  { title: '¿Qué quieres usar?', fields: ['enabledModules'] },
  { title: 'Elige tu estilo', fields: ['theme'] },
] as const

/** First-run setup: shown until the profile has `onboardedAt`. */
export function OnboardingPage() {
  const { me, updateProfile } = useMe()
  const { preference, setPreference } = useTheme()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<ProfileValues>(() => {
    // A new account still has the defaults: suggest the device's time zone instead.
    const deviceZone = browserTimeZone()
    return {
      displayName: me.profile.displayName ?? '',
      currency: me.profile.currency,
      timezone: isTimeZone(deviceZone) ? deviceZone : me.profile.timezone,
      weekStartsOn: me.profile.weekStartsOn,
    }
  })
  const [modules, setModules] = useState<ModuleId[]>(me.profile.enabledModules)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const update: ProfileUpdate = {
    displayName: profile.displayName.trim() || null,
    currency: profile.currency,
    timezone: profile.timezone,
    weekStartsOn: profile.weekStartsOn,
    enabledModules: modules,
    theme: preference,
    completeOnboarding: true,
  }

  /** Errors that belong to the fields of `stepIndex`, from the shared schema. */
  function stepErrors(stepIndex: number): FieldErrors {
    const result = profileUpdateSchema.safeParse(update)
    if (result.success) return {}
    const fields: FieldErrors = {}
    for (const issue of result.error.issues) {
      const [field] = issue.path
      const current = STEPS[stepIndex]
      if (typeof field === 'string' && current?.fields.some((f) => f === field)) {
        fields[field] = [...(fields[field] ?? []), issue.message]
      }
    }
    return fields
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = stepErrors(step)
    setErrors(invalid)
    if (Object.keys(invalid).length > 0) return
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }

    setBusy(true)
    setError(null)
    try {
      await updateProfile(update)
      void navigate('/', { replace: true })
    } catch (err) {
      const failure = describeFailure(err)
      setError(failure.message)
      setErrors(failure.fields)
    } finally {
      setBusy(false)
    }
  }

  const current = STEPS[step] ?? STEPS[0]
  const last = step === STEPS.length - 1

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          Paso {step + 1} de {STEPS.length}
        </p>
        <h1 className="text-2xl">{current.title}</h1>
      </header>

      <form
        noValidate
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-col gap-5 rounded border border-border bg-card p-5"
      >
        {step === 0 && (
          <>
            <p>
              Libreta te ayuda a llevar tus ingresos, gastos, deudas y ahorro. Te haremos cuatro
              preguntas rápidas; todo se puede cambiar después en Ajustes.
            </p>
            <ProfileFields
              values={profile}
              onChange={setProfile}
              errors={errors}
              show={['displayName']}
            />
          </>
        )}
        {step === 1 && (
          <ProfileFields
            values={profile}
            onChange={setProfile}
            errors={errors}
            show={['currency', 'timezone', 'weekStartsOn']}
          />
        )}
        {step === 2 && (
          <>
            <p className="text-sm text-muted-foreground">
              Solo verás en el menú lo que actives. Puedes cambiarlo cuando quieras.
            </p>
            <ModulePicker value={modules} onChange={setModules} errors={errors.enabledModules} />
          </>
        )}
        {step === 3 && <ThemePicker value={preference} onChange={setPreference} />}

        {error && <FormAlert>{error}</FormAlert>}

        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => {
                setErrors({})
                setStep(step - 1)
              }}
              className="rounded border border-border px-4 py-2 hover:bg-muted"
            >
              Atrás
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {last ? (busy ? 'Guardando…' : 'Empezar') : 'Siguiente'}
          </button>
        </div>
      </form>
    </div>
  )
}

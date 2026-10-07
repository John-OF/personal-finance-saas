import type { ModuleId, ThemePreference } from '@pf/shared'
import { TextField } from '../../components/ui/form'
import { currencyOptions, timeZoneGroups, WEEK_STARTS } from '../../lib/locale-options'
import { MODULES } from '../../lib/modules'
import { MODES, resolvedMode, THEMES } from '../../lib/theme'
import type { FieldErrors } from '../auth/submit'

export interface ProfileValues {
  displayName: string
  currency: string
  timezone: string
  weekStartsOn: number
}

const selectClass =
  'rounded border border-input bg-card px-3 py-2 text-base aria-invalid:border-destructive'

function FieldError({ id, errors }: { id: string; errors: string[] | undefined }) {
  if (!errors?.length) return null
  return (
    <span id={id} className="text-destructive">
      {errors[0]}
    </span>
  )
}

/** Name, currency, time zone and first day of the week; shared by the wizard and Settings. */
export function ProfileFields({
  values,
  onChange,
  errors,
  show = ['displayName', 'currency', 'timezone', 'weekStartsOn'],
}: {
  values: ProfileValues
  onChange: (values: ProfileValues) => void
  errors: FieldErrors
  show?: (keyof ProfileValues)[]
}) {
  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) =>
    onChange({ ...values, [key]: value })

  return (
    <div className="flex flex-col gap-3">
      {show.includes('displayName') && (
        <TextField
          label="¿Cómo te llamamos? (opcional)"
          name="displayName"
          autoComplete="given-name"
          value={values.displayName}
          onChange={(e) => set('displayName', e.target.value)}
          errors={errors.displayName}
        />
      )}
      {show.includes('currency') && (
        <label className="flex flex-col gap-1 text-sm">
          Moneda
          <select
            name="currency"
            value={values.currency}
            onChange={(e) => set('currency', e.target.value)}
            aria-invalid={Boolean(errors.currency?.length)}
            aria-describedby="currency-error"
            className={selectClass}
          >
            {currencyOptions(values.currency).map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <FieldError id="currency-error" errors={errors.currency} />
        </label>
      )}
      {show.includes('timezone') && (
        <label className="flex flex-col gap-1 text-sm">
          Zona horaria
          <select
            name="timezone"
            value={values.timezone}
            onChange={(e) => set('timezone', e.target.value)}
            aria-invalid={Boolean(errors.timezone?.length)}
            aria-describedby="timezone-error"
            className={selectClass}
          >
            {timeZoneGroups(values.timezone).map(({ region, options }) => (
              <optgroup key={region} label={region}>
                {options.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <FieldError id="timezone-error" errors={errors.timezone} />
        </label>
      )}
      {show.includes('weekStartsOn') && (
        <label className="flex flex-col gap-1 text-sm">
          La semana empieza el
          <select
            name="weekStartsOn"
            value={values.weekStartsOn}
            onChange={(e) => set('weekStartsOn', Number(e.target.value))}
            className={selectClass}
          >
            {WEEK_STARTS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

/** Checkbox per module with a short description of what it does. */
export function ModulePicker({
  value,
  onChange,
  errors,
}: {
  value: ModuleId[]
  onChange: (modules: ModuleId[]) => void
  errors: string[] | undefined
}) {
  function toggle(id: ModuleId, on: boolean) {
    // Keeps the canonical order, whatever order they were ticked in.
    onChange(MODULES.map((m) => m.id).filter((m) => (m === id ? on : value.includes(m))))
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby="modules-error">
      <legend className="sr-only">Módulos</legend>
      {MODULES.map(({ id, label, description }) => (
        <label
          key={id}
          className="flex cursor-pointer gap-3 rounded border border-border p-3 has-checked:border-primary"
        >
          <input
            type="checkbox"
            checked={value.includes(id)}
            onChange={(e) => toggle(id, e.target.checked)}
            className="mt-1 accent-primary"
          />
          <span className="flex flex-col">
            <span className="font-medium">{label}</span>
            <span className="text-sm text-muted-foreground">{description}</span>
          </span>
        </label>
      ))}
      <FieldError id="modules-error" errors={errors} />
    </fieldset>
  )
}

/** Theme cards (previewed in the mode in use) and the light/dark/system choice. */
export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemePreference
  onChange: (preference: ThemePreference) => void
}) {
  const previewMode = resolvedMode(value.mode)
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-muted-foreground">Tema</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                  checked={value.theme === id}
                  onChange={() => onChange({ ...value, theme: id })}
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
                checked={value.mode === id}
                onChange={() => onChange({ ...value, mode: id })}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

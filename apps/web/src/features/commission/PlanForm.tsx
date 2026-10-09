import {
  commissionPlanInputSchema,
  formErrors,
  parsePercentToBp,
  type CommissionPlan,
} from '@pf/shared'
import { useState, type FormEvent } from 'react'
import { FormAlert, SubmitButton, TextField } from '../../components/ui/form'
import { describeFailure, type FieldErrors } from '../auth/submit'
import { commissionApi } from './api'
import { DEFAULT_SCHEDULE_CHOICE, scheduleOf, type ScheduleChoice } from './schedule'
import { ScheduleFields } from './ScheduleFields'

/** Creates a plan: name, percentage and pay week. */
export function PlanForm({
  defaultName,
  submitLabel,
  onCreated,
  onCancel,
}: {
  defaultName: string
  submitLabel: string
  onCreated: (plan: CommissionPlan) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(defaultName)
  const [percent, setPercent] = useState('50')
  const [schedule, setSchedule] = useState<ScheduleChoice>(DEFAULT_SCHEDULE_CHOICE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldErrors>({})

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const percentBp = parsePercentToBp(percent)
    const input = { name, percentBp: percentBp ?? 0, ...scheduleOf(schedule) }
    const invalid = formErrors(commissionPlanInputSchema, input)
    if (percentBp === null || invalid) {
      setFields({
        ...invalid,
        ...(percentBp === null && { percentBp: ['Escribe un número entre 0,01 y 100.'] }),
      })
      return
    }
    setBusy(true)
    setError(null)
    setFields({})
    try {
      onCreated(await commissionApi.createPlan(input))
    } catch (err) {
      const failure = describeFailure(err)
      setError(failure.message)
      setFields(failure.fields)
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <TextField
        label="Nombre"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        errors={fields.name}
        maxLength={60}
      />
      <div className="flex flex-col gap-1">
        <TextField
          label="¿Qué porcentaje de lo que haces te pagan?"
          name="percentBp"
          inputMode="decimal"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          errors={fields.percentBp}
        />
        <span className="text-sm text-muted-foreground">Por ejemplo, 50 si te pagan la mitad.</span>
      </div>
      <ScheduleFields value={schedule} onChange={setSchedule} />
      {error && <FormAlert>{error}</FormAlert>}
      <div className="flex flex-wrap gap-3">
        <SubmitButton busy={busy} busyLabel="Creando…">
          {submitLabel}
        </SubmitButton>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border px-4 py-2 hover:bg-muted"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

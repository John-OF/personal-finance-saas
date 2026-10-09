import {
  addDays,
  applyPercentBp,
  COMMISSION_IMPORT_BATCH,
  commissionCsv,
  commissionPlanUpdateSchema,
  formErrors,
  parseCommissionCsv,
  parsePercentToBp,
  rateOn,
  unconfirmedWeeks,
  type CommissionCsvRow,
  type CommissionPlan,
} from '@pf/shared'
import { ArrowLeft } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { FormAlert, SubmitButton, TextField } from '../../components/ui/form'
import { useToast } from '../../components/ui/toast-context'
import { downloadText, fileSlug } from '../../lib/download'
import { describeFailure, type FieldErrors } from '../auth/submit'
import { commissionApi } from './api'
import { useCommission } from './commission-context'
import { dayName, shortDate } from '../../lib/labels'
import { PlanForm } from './PlanForm'
import { choiceOf, scheduleOf, type ScheduleChoice } from './schedule'
import { ScheduleFields } from './ScheduleFields'

const MAX_IMPORT_BYTES = 2 * 1024 * 1024
const secondaryButton =
  'rounded border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded border border-border bg-card p-5">
      <h3 className="text-lg">{title}</h3>
      {children}
    </section>
  )
}

function PlanSection() {
  const { plan, reloadPlans, reloadWeeks } = useCommission()
  const toast = useToast()
  const [name, setName] = useState(plan.name)
  const [schedule, setSchedule] = useState<ScheduleChoice>(() => choiceOf(plan))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldErrors>({})

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const update = { name, ...scheduleOf(schedule) }
    const invalid = formErrors(commissionPlanUpdateSchema, update)
    if (invalid) {
      setFields(invalid)
      return
    }
    setBusy(true)
    setError(null)
    setFields({})
    try {
      await commissionApi.updatePlan(plan.id, update)
      reloadPlans()
      reloadWeeks()
      toast('Ajustes guardados')
    } catch (err) {
      const failure = describeFailure(err)
      setError(failure.message)
      setFields(failure.fields)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Plan">
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <TextField
          label="Nombre"
          name="name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          errors={fields.name}
        />
        <ScheduleFields value={schedule} onChange={setSchedule} />
        <p className="text-sm text-muted-foreground">
          Si cambias la semana de pago, las semanas se vuelven a agrupar. Las que ya marcaste como
          cobradas conservan lo que confirmaste.
        </p>
        {error && <FormAlert>{error}</FormAlert>}
        <SubmitButton busy={busy} busyLabel="Guardando…">
          Guardar
        </SubmitButton>
      </form>
    </Section>
  )
}

function PercentSection() {
  const { plan, currentPayday, reloadPlans, reloadWeeks, percent, money } = useCommission()
  const toast = useToast()
  const current = rateOn(plan.rates, currentPayday)
  const [value, setValue] = useState(String(current / 100).replace('.', ','))
  const [from, setFrom] = useState(currentPayday)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Eight paydays back (to correct a mistake) and eight ahead.
  const paydays = Array.from({ length: 17 }, (_, i) => addDays(currentPayday, (i - 8) * 7))
  const typed = parsePercentToBp(value)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (typed === null) {
      setError('Escribe un número entre 0,01 y 100.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await commissionApi.setRate(plan.id, { percentBp: typed, effectiveFrom: from })
      reloadPlans()
      reloadWeeks()
      toast(`Desde el pago del ${shortDate(from)}: ${percent(typed)}`)
    } catch (err) {
      setError(describeFailure(err).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(effectiveFrom: string) {
    try {
      await commissionApi.deleteRate(plan.id, effectiveFrom)
      reloadPlans()
      reloadWeeks()
    } catch (err) {
      toast(describeFailure(err).message)
    }
  }

  return (
    <Section title="Porcentaje que te pagan">
      <p>
        Ahora: <strong>{percent(current)}</strong>
      </p>
      {plan.rates.length > 1 && (
        <ul className="flex flex-col gap-1 text-sm">
          {plan.rates.map((rate, i) => (
            <li key={rate.effectiveFrom} className="flex items-center justify-between gap-3">
              <span>
                {i === 0
                  ? 'Desde el principio'
                  : `Desde el pago del ${shortDate(rate.effectiveFrom)}`}
                : <strong>{percent(rate.percentBp)}</strong>
              </span>
              <button
                type="button"
                onClick={() => void remove(rate.effectiveFrom)}
                className="h-8 rounded px-2 font-semibold text-destructive hover:bg-muted"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form noValidate onSubmit={(e) => void save(e)} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Nuevo porcentaje
            <span className="flex items-center gap-2 text-lg font-bold">
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-28 rounded border border-input bg-card px-3 py-2 text-lg"
              />
              %
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            A partir del pago del
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border border-input bg-card px-3 py-2 text-base"
            >
              {paydays.map((payday) => (
                <option key={payday} value={payday}>
                  {dayName(payday)} {shortDate(payday)}
                  {payday === currentPayday ? ' (esta semana)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          {typed === null
            ? 'Escribe un número entre 0,01 y 100.'
            : `Con ${percent(typed)}, si haces ${money(7000)} te pagan ${money(applyPercentBp(7000, typed))}.`}{' '}
          Se aplica desde esa semana; las anteriores no cambian.
        </p>
        {error && <FormAlert>{error}</FormAlert>}
        <SubmitButton busy={busy} busyLabel="Guardando…">
          Guardar porcentaje
        </SubmitButton>
      </form>
    </Section>
  )
}

type ImportState =
  | { step: 'idle' }
  | { step: 'confirm'; rows: CommissionCsvRow[]; invalidRows: number }
  | { step: 'importing'; done: number; total: number }

function DataSection() {
  const { plan, weeks, today, reloadWeeks } = useCommission()
  const fileInput = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<ImportState>({ step: 'idle' })
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [exporting, setExporting] = useState(false)

  async function exportCsv() {
    setExporting(true)
    setMessage(null)
    try {
      const { entries } = await commissionApi.entries(plan.id)
      downloadText(
        `${fileSlug(plan.name)}-${today}.csv`,
        commissionCsv(entries, plan, plan.rates),
        'text/csv;charset=utf-8',
      )
      setMessage({ text: 'Tu archivo CSV se está descargando.' })
    } catch (err) {
      setMessage({ text: describeFailure(err).message, error: true })
    } finally {
      setExporting(false)
    }
  }

  async function readFile(file: File) {
    setMessage(null)
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage({ text: 'El archivo es demasiado grande (máximo 2 MB).', error: true })
      return
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      setMessage({ text: 'No se pudo leer el archivo.', error: true })
      return
    }
    const parsed = parseCommissionCsv(text)
    if (!parsed.ok) {
      setMessage({ text: 'El archivo necesita las columnas Fecha y Monto.', error: true })
    } else if (parsed.rows.length === 0) {
      setMessage({ text: 'No se encontraron registros en el archivo.', error: true })
    } else {
      setState({ step: 'confirm', rows: parsed.rows, invalidRows: parsed.invalidRows })
    }
  }

  async function runImport(rows: CommissionCsvRow[], invalidRows: number) {
    let added = 0
    let skipped = 0
    try {
      for (let start = 0; start < rows.length; start += COMMISSION_IMPORT_BATCH) {
        setState({ step: 'importing', done: start, total: rows.length })
        const result = await commissionApi.importEntries(plan.id, {
          rows: rows.slice(start, start + COMMISSION_IMPORT_BATCH),
        })
        added += result.added
        skipped += result.skipped
      }
      let text = `Se ${added === 1 ? 'importó 1 registro' : `importaron ${added} registros`}`
      if (skipped > 0) text += `; ${skipped} ya ${skipped === 1 ? 'estaba' : 'estaban'}`
      if (invalidRows > 0) {
        text += `; ${invalidRows} ${invalidRows === 1 ? 'fila no se pudo leer' : 'filas no se pudieron leer'}`
      }
      setMessage({ text: `${text}.` })
    } catch (err) {
      // Batches already sent stay imported; importing the same file again skips them.
      setMessage({
        text: `${describeFailure(err).message} Se alcanzaron a importar ${added}; si vuelves a importar el archivo, no se duplican.`,
        error: true,
      })
    } finally {
      setState({ step: 'idle' })
      reloadWeeks()
    }
  }

  return (
    <Section title="Tus datos">
      <p className="text-sm text-muted-foreground">
        Descarga tus registros en CSV (se abre con Excel) o importa el CSV del archivo «Mis
        ingresos»: lo que ya esté anotado no se duplica.
      </p>
      {state.step === 'confirm' ? (
        <div className="flex flex-col gap-3 rounded border border-border p-4">
          <p>
            Se encontraron <strong>{state.rows.length}</strong>{' '}
            {state.rows.length === 1 ? 'registro' : 'registros'}
            {state.invalidRows > 0 &&
              ` (${state.invalidRows} ${state.invalidRows === 1 ? 'fila no se pudo leer' : 'filas no se pudieron leer'})`}
            . Se importarán en «{plan.name}».
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void runImport(state.rows, state.invalidRows)}
              className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Importar
            </button>
            <button
              type="button"
              onClick={() => setState({ step: 'idle' })}
              className={secondaryButton}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting || !weeks?.length}
            className={secondaryButton}
          >
            {exporting ? 'Preparando…' : 'Descargar CSV'}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={state.step === 'importing'}
            className={secondaryButton}
          >
            {state.step === 'importing'
              ? `Importando… ${state.done} de ${state.total}`
              : 'Importar CSV'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void readFile(file)
            }}
          />
        </div>
      )}
      {message && <FormAlert tone={message.error ? 'error' : 'info'}>{message.text}</FormAlert>}
    </Section>
  )
}

/**
 * Past weeks with entries that were never marked as paid, typically after importing the prototype's
 * CSV (its payouts are not in the file). Marks them with the expected share in one go; any week can
 * then be corrected or undone from its own page.
 */
function UnconfirmedSection() {
  const { plan, weeks, currentPayday, reloadWeeks, money } = useCommission()
  const toast = useToast()
  const pending = weeks ? unconfirmedWeeks(weeks, addDays(currentPayday, -7)) : []
  const [through, setThrough] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (pending.length === 0) return null
  const selected =
    through && pending.some((week) => week.payday === through) ? through : pending[0]!.payday
  const chosen = unconfirmedWeeks(pending, selected)
  const total = chosen.reduce((sum, week) => sum + week.expectedCents, 0)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const { confirmed, paidCents } = await commissionApi.confirmPayoutsThrough(plan.id, selected)
      reloadWeeks()
      toast(
        `${confirmed === 1 ? 'Se marcó 1 semana como cobrada' : `Se marcaron ${confirmed} semanas como cobradas`}: ${money(paidCents)}`,
      )
    } catch (err) {
      setError(describeFailure(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Semanas sin confirmar">
      <p className="text-sm text-muted-foreground">
        {pending.length === 1
          ? 'Hay 1 semana pasada con ingresos que no marcaste como cobrada'
          : `Hay ${pending.length} semanas pasadas con ingresos que no marcaste como cobradas`}{' '}
        (pasa al importar el CSV del archivo «Mis ingresos», que no guarda los cobros). Puedes
        marcarlas aquí con lo calculado y luego corregir desde su semana la que te hayan pagado
        distinto.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Hasta el pago del
        <select
          value={selected}
          onChange={(e) => setThrough(e.target.value)}
          className="rounded border border-input bg-card px-3 py-2 text-base"
        >
          {pending.map((week) => (
            <option key={week.payday} value={week.payday}>
              {dayName(week.payday)} {shortDate(week.payday)} {week.payday.slice(0, 4)} —{' '}
              {money(week.expectedCents)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm">
        {chosen.length === 1
          ? 'Se marcará 1 semana como cobrada'
          : `Se marcarán ${chosen.length} semanas como cobradas`}
        , por <strong>{money(total)}</strong> en total.
      </p>
      {error && <FormAlert>{error}</FormAlert>}
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={busy}
        className="self-start rounded bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy
          ? 'Marcando…'
          : chosen.length === 1
            ? 'Marcar 1 semana como cobrada'
            : `Marcar ${chosen.length} semanas como cobradas`}
      </button>
    </Section>
  )
}

function NewPlanSection() {
  const { reloadPlans, selectPlan } = useCommission()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function created(plan: CommissionPlan) {
    selectPlan(plan.id)
    reloadPlans()
    void navigate('/commission')
  }

  return (
    <Section title="Otro lugar de trabajo">
      <p className="text-sm text-muted-foreground">
        Si trabajas en más de un sitio, cada uno puede tener su propio plan, con su porcentaje y su
        día de pago.
      </p>
      {open ? (
        <PlanForm
          defaultName=""
          submitLabel="Crear plan"
          onCreated={created}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`self-start ${secondaryButton}`}
        >
          Agregar otro plan
        </button>
      )}
    </Section>
  )
}

/** /commission/settings: the plan's name, pay week and percentage, and its data. */
export function PlanSettings() {
  const { plan } = useCommission()
  return (
    <div key={plan.id} className="flex flex-col gap-6">
      <Link
        to="/commission"
        className="flex items-center gap-1 self-start text-sm text-link underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Volver a la semana
      </Link>
      <PlanSection />
      <PercentSection />
      <DataSection />
      <UnconfirmedSection />
      <NewPlanSection />
    </div>
  )
}

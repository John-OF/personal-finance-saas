import {
  daysBetween,
  MAX_AMOUNT_CENTS,
  parseAmountToCents,
  todayIn,
  type CommissionWeekSummary,
} from '@pf/shared'
import { Check } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useMe } from '../../app/me-context'
import { FormAlert } from '../../components/ui/form'
import { useCommission } from './commission-context'
import { amountText, dayName, shortDate } from './labels'

/**
 * Confirming the week's payment with what was really paid (it can differ from the calculation),
 * and undoing it. Shown once the week has something recorded or was already paid.
 */
export function PayoutBox({
  week,
  onConfirm,
  onUndo,
}: {
  week: CommissionWeekSummary
  onConfirm: (paidCents: number) => Promise<boolean>
  onUndo: () => void
}) {
  const { today, money, symbol } = useCommission()
  const { locale, timezone } = useMe().me.profile
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!week.payout && week.grossCents === 0) return null

  if (week.payout) {
    const { paidCents, paidAt } = week.payout
    const difference = paidCents - week.expectedCents
    let meta = `Lo marcaste el ${shortDate(todayIn(timezone, new Date(paidAt)))}.`
    if (week.grossCents > 0 && difference !== 0) {
      meta =
        difference < 0
          ? `Te pagaron ${money(-difference)} menos de lo calculado (${money(week.expectedCents)}).`
          : `Te pagaron ${money(difference)} más de lo calculado (${money(week.expectedCents)}).`
    }
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-card">
          <Check aria-hidden className="size-5" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Cobrado: {money(paidCents)}</p>
          <p className="text-sm text-muted-foreground">{meta}</p>
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="h-9 rounded-lg px-2 text-sm font-semibold text-link hover:bg-muted"
        >
          Deshacer
        </button>
      </section>
    )
  }

  if (editing) {
    async function submit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      const paidCents = parseAmountToCents(amount)
      if (paidCents === null || paidCents < 0 || paidCents > MAX_AMOUNT_CENTS) {
        setError('Escribe cuánto te pagaron, por ejemplo 35.')
        return
      }
      setBusy(true)
      setError(null)
      if (await onConfirm(paidCents)) setEditing(false)
      setBusy(false)
    }

    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div>
            <p className="font-bold">¿Cuánto te pagaron?</p>
            <p className="text-sm text-muted-foreground">
              Lo calculado es {money(week.expectedCents)}. Cámbialo si te pagaron otra cantidad.
            </p>
          </div>
          <label className="flex h-14 cursor-text items-center rounded-xl border-2 border-transparent bg-muted px-4 focus-within:border-primary focus-within:bg-card">
            <span className="mr-1.5 font-heading text-2xl font-bold text-muted-foreground">
              {symbol}
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Monto que te pagaron"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 bg-transparent font-heading text-3xl font-extrabold tabular-nums outline-none"
            />
          </label>
          {error && <FormAlert>{error}</FormAlert>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-12 rounded-xl border border-border px-5 font-bold hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="h-12 flex-1 rounded-xl bg-primary px-5 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Guardando…' : 'Confirmar'}
            </button>
          </div>
        </form>
      </section>
    )
  }

  const before = daysBetween(today, week.payday) > 0
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-[170px] flex-1">
        <p className="font-bold">
          {before
            ? `¿Te pagaron antes del ${dayName(week.payday)}?`
            : `¿Ya te pagaron los ${money(week.expectedCents)}?`}
        </p>
        {!before && (
          <p className="text-sm text-muted-foreground">
            Márcalo para llevar la cuenta de lo que ya cobraste.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setAmount(amountText(week.expectedCents, locale))
          setError(null)
          setEditing(true)
        }}
        className={`h-10 shrink-0 rounded-lg px-3.5 text-sm font-bold ${
          before
            ? 'border border-border hover:bg-muted'
            : 'bg-primary text-primary-foreground hover:opacity-90'
        }`}
      >
        Marcar como cobrado
      </button>
    </section>
  )
}

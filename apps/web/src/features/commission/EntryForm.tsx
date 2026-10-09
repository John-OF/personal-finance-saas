import { addDays, daysBetween, isDateKey } from '@pf/shared'
import type { FormEvent, RefObject } from 'react'
import { FormAlert } from '../../components/ui/form'
import { useCommission } from './commission-context'
import { dayLabel, longDate } from '../../lib/labels'

export interface EntryDraft {
  /** Set while editing an entry. */
  editingId: string | null
  date: string
  amount: string
  note: string
}

function title(draft: EntryDraft, today: string) {
  if (draft.editingId) return 'Editar registro'
  const ago = daysBetween(draft.date, today)
  if (ago === 0) return '¿Cuánto hiciste hoy?'
  if (ago === 1) return '¿Cuánto hiciste ayer?'
  if (ago > 1 && ago < 7) return `¿Cuánto hiciste el ${dayLabel(draft.date)}?`
  return `¿Cuánto hiciste el ${longDate(draft.date)}?`
}

const chipClass =
  'h-10 shrink-0 rounded-full border px-4 text-[0.95rem] font-semibold aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background border-border'

/** The quick entry of the prototype: a big amount, Hoy / Ayer / a date, and a note. */
export function EntryForm({
  draft,
  onChange,
  busy,
  error,
  onSubmit,
  onCancel,
  amountRef,
}: {
  draft: EntryDraft
  onChange: (draft: EntryDraft) => void
  busy: boolean
  error: string | null
  onSubmit: () => void
  onCancel: () => void
  amountRef: RefObject<HTMLInputElement | null>
}) {
  const { today, symbol } = useCommission()
  const set = (fields: Partial<EntryDraft>) => onChange({ ...draft, ...fields })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <section
      aria-labelledby="entry-title"
      className="rounded-2xl border border-border bg-card p-4"
      id="entry-form"
    >
      <h3 id="entry-title" className="mb-3 text-lg font-bold">
        {title(draft, today)}
      </h3>
      <form noValidate onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex h-16 cursor-text items-center rounded-xl border-2 border-transparent bg-muted px-4 focus-within:border-primary focus-within:bg-card">
          <span className="mr-1.5 font-heading text-3xl font-bold text-muted-foreground">
            {symbol}
          </span>
          <input
            ref={amountRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            aria-label="Monto"
            value={draft.amount}
            onChange={(e) => set({ amount: e.target.value })}
            className="min-w-0 flex-1 bg-transparent font-heading text-4xl font-extrabold tabular-nums outline-none placeholder:text-muted-foreground/50"
          />
        </label>
        <div className="flex items-center gap-2">
          {[
            { label: 'Hoy', date: today },
            { label: 'Ayer', date: addDays(today, -1) },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              aria-pressed={draft.date === chip.date}
              onClick={() => set({ date: chip.date })}
              className={chipClass}
            >
              {chip.label}
            </button>
          ))}
          <input
            type="date"
            aria-label="Fecha del ingreso"
            value={draft.date}
            onChange={(e) => {
              if (isDateKey(e.target.value)) set({ date: e.target.value })
            }}
            className="h-10 min-w-0 flex-1 rounded-full border border-border bg-transparent px-4 text-[0.95rem]"
          />
        </div>
        <input
          type="text"
          maxLength={80}
          autoComplete="off"
          placeholder="Nota (opcional)"
          aria-label="Nota"
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          className="h-12 rounded-xl border-2 border-transparent bg-muted px-4 outline-none focus:border-primary focus:bg-card"
        />
        {error && <FormAlert>{error}</FormAlert>}
        <div className="flex gap-2">
          {draft.editingId && (
            <button
              type="button"
              onClick={onCancel}
              className="h-12 rounded-xl border border-border px-5 font-bold hover:bg-muted"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="h-12 flex-1 rounded-xl bg-primary px-5 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Guardando…' : draft.editingId ? 'Guardar cambios' : 'Guardar ingreso'}
          </button>
        </div>
      </form>
    </section>
  )
}

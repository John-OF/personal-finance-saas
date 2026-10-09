import type { CommissionEntry } from '@pf/shared'
import { ChevronDown } from 'lucide-react'
import { useCommission } from './commission-context'
import { capitalize, dayName, shortDate } from './labels'

/** The seven days of the week, each one opening to its entries with Editar / Borrar. */
export function DayList({
  dates,
  entriesByDate,
  payday,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onAddTo,
}: {
  dates: string[]
  entriesByDate: Map<string, CommissionEntry[]>
  payday: string
  expanded: string | null
  onToggle: (date: string) => void
  onEdit: (entry: CommissionEntry) => void
  onDelete: (entry: CommissionEntry) => void
  onAddTo: (date: string) => void
}) {
  const { today, money } = useCommission()

  return (
    <ul className="overflow-hidden rounded-2xl border border-border bg-card">
      {dates.map((date) => {
        const entries = entriesByDate.get(date) ?? []
        const total = entries.reduce((sum, { amountCents }) => sum + amountCents, 0)
        const open = expanded === date
        return (
          <li key={date} id={`day-${date}`} className="border-t border-border first:border-t-0">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`day-body-${date}`}
              onClick={() => onToggle(date)}
              className="grid min-h-15 w-full grid-cols-[1fr_auto_18px] items-center gap-3 py-2.5 pr-3.5 pl-4 text-left"
            >
              <span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                  {capitalize(dayName(date))}
                  {date === today && (
                    <span className="rounded-full bg-foreground px-2 text-xs font-semibold text-background">
                      hoy
                    </span>
                  )}
                  {date === payday && (
                    <span className="rounded-full bg-envelope-accent px-2 text-xs font-semibold text-envelope-accent-foreground">
                      día de pago
                    </span>
                  )}
                </span>
                <span className="block text-sm text-muted-foreground">{shortDate(date)}</span>
              </span>
              <span
                className={`text-right tabular-nums ${total > 0 ? 'font-bold' : 'text-muted-foreground'}`}
              >
                {total > 0 ? money(total) : '—'}
                {entries.length > 1 && (
                  <small className="block text-xs font-medium text-muted-foreground">
                    {entries.length} registros
                  </small>
                )}
              </span>
              <ChevronDown
                aria-hidden
                className={`size-[18px] text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
            {open && (
              <div id={`day-body-${date}`} className="px-4 pb-3.5">
                {entries.length === 0 && (
                  <p className="border-t border-dashed border-border pt-2.5 pb-1 text-sm text-muted-foreground">
                    Sin registros este día.
                  </p>
                )}
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-1.5 border-t border-dashed border-border py-2"
                  >
                    <span className="min-w-18 font-bold tabular-nums">
                      {money(entry.amountCents)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {entry.note}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEdit(entry)}
                      aria-label={`Editar ${money(entry.amountCents)}`}
                      className="h-9 rounded-lg px-2 text-sm font-semibold text-link hover:bg-muted"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry)}
                      aria-label={`Borrar ${money(entry.amountCents)}`}
                      className="h-9 rounded-lg px-2 text-sm font-semibold text-destructive hover:bg-muted"
                    >
                      Borrar
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onAddTo(date)}
                  className="mt-2 h-10 rounded-lg border border-border px-3.5 text-sm font-bold hover:bg-muted"
                >
                  {entries.length > 0 ? 'Agregar otro a este día' : 'Agregar a este día'}
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

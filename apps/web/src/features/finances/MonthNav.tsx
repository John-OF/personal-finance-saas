import { addMonths } from '@pf/shared'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel } from '../../lib/labels'

const arrowClass =
  'grid size-11 place-items-center rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40'

/** ‹ Octubre 2026 ›, without going past the current month. */
export function MonthNav({
  month,
  currentMonth,
  onChange,
}: {
  month: string
  currentMonth: string
  onChange: (month: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(addMonths(month, -1))}
        aria-label="Mes anterior"
        className={arrowClass}
      >
        <ChevronLeft aria-hidden className="size-5" />
      </button>
      <div className="min-w-0 flex-1 text-center">
        <p className="font-heading text-xl" aria-live="polite">
          {monthLabel(month)}
        </p>
        {month !== currentMonth && (
          <button
            type="button"
            onClick={() => onChange(currentMonth)}
            className="text-sm font-semibold text-link hover:underline"
          >
            Ir al mes actual
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(addMonths(month, 1))}
        disabled={month >= currentMonth}
        aria-label="Mes siguiente"
        className={arrowClass}
      >
        <ChevronRight aria-hidden className="size-5" />
      </button>
    </div>
  )
}

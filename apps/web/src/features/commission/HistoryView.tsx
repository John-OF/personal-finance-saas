import { weekShareCents, yearSummary, type CommissionWeekSummary } from '@pf/shared'
import { useNavigate } from 'react-router'
import { useCommission } from './commission-context'
import { dayName, monthLabel, shortDate } from '../../lib/labels'

function status(week: CommissionWeekSummary, currentPayday: string) {
  if (week.payout) return { label: 'Cobrado', className: 'border-transparent bg-success text-card' }
  if (week.payday === currentPayday) {
    return { label: 'En curso', className: 'border-foreground bg-foreground text-background' }
  }
  if (week.payday > currentPayday)
    return { label: 'Próxima', className: 'border-border text-muted-foreground' }
  return { label: 'Sin confirmar', className: 'border-border text-muted-foreground' }
}

/** The "Historial" tab: every week by month, with what was paid or is owed, and the year so far. */
export function HistoryView() {
  const { weeks, today, currentPayday, money } = useCommission()
  const navigate = useNavigate()

  if (!weeks) return <p className="text-muted-foreground">Cargando…</p>
  if (weeks.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card px-5 py-7 text-center text-muted-foreground">
        Cuando anotes tu primer ingreso, aquí verás cada semana con lo que te tocó cobrar.
      </p>
    )
  }

  const year = today.slice(0, 4)
  const summary = yearSummary(weeks, year)
  const months = new Map<string, CommissionWeekSummary[]>()
  for (const week of weeks) {
    const month = week.payday.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), week])
  }

  return (
    <div className="flex flex-col gap-6">
      {summary.daysWorked > 0 && (
        <p className="text-lg leading-relaxed">
          En {year} llevas{' '}
          <strong className="whitespace-nowrap">{money(summary.shareCents)}</strong> de tu parte en{' '}
          <strong className="whitespace-nowrap">
            {summary.daysWorked} {summary.daysWorked === 1 ? 'día trabajado' : 'días trabajados'}
          </strong>
          , unos <strong className="whitespace-nowrap">{money(summary.perDayCents)}</strong> por
          día.
        </p>
      )}

      {[...months].map(([month, monthWeeks]) => {
        const monthShare = monthWeeks.reduce((sum, week) => sum + weekShareCents(week), 0)
        return (
          <section key={month} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-bold">{monthLabel(month)}</h3>
              <span className="text-sm text-muted-foreground tabular-nums">
                Tu parte: {money(monthShare)}
              </span>
            </div>
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              {monthWeeks.map((week) => {
                const state = status(week, currentPayday)
                return (
                  <li key={week.payday} className="border-t border-border first:border-t-0">
                    <button
                      type="button"
                      onClick={() =>
                        void navigate(
                          week.payday === currentPayday
                            ? '/commission'
                            : `/commission?semana=${week.payday}`,
                        )
                      }
                      className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted"
                    >
                      <span className="font-semibold">
                        Pago del {dayName(week.payday)} {shortDate(week.payday)}
                      </span>
                      <span className="justify-self-end font-heading text-2xl leading-tight font-extrabold tabular-nums">
                        {money(weekShareCents(week))}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {week.grossCents > 0
                          ? `${week.payday >= currentPayday ? 'Llevas' : 'Hiciste'} ${money(week.grossCents)}`
                          : 'Sin ingresos registrados'}
                      </span>
                      <span
                        className={`justify-self-end rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap ${state.className}`}
                      >
                        {state.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

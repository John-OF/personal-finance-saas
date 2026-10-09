import { daysBetween, type CommissionWeekSummary } from '@pf/shared'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, type CSSProperties } from 'react'
import { useCommission } from './commission-context'
import {
  capitalize,
  dayAbbreviation,
  dayInitials,
  dayLabel,
  dayName,
  dayNumber,
  rangeLabel,
} from './labels'

export interface DayTotal {
  date: string
  totalCents: number
}

/** The headline: who pays what and when, as the prototype words it. */
function headline(week: CommissionWeekSummary, today: string, isCurrent: boolean) {
  const until = daysBetween(today, week.payday)
  const payday = dayName(week.payday)
  if (week.payout) return 'Cobraste'
  if (until === 0) return 'Hoy te pagan'
  if (until === 1) return 'Mañana te pagan'
  if (until > 1 && isCurrent)
    return until === 7 ? `Te pagan el próximo ${payday}` : `Te pagan este ${payday}`
  if (until > 1) return `Te pagarían el ${dayLabel(week.payday)}`
  return `Te tocaba cobrar el ${dayLabel(week.payday)}`
}

/**
 * The week's pay envelope (from the prototype): what the user gets, the days as bars split into
 * their share and the rest, and the payday as a seal. Swiping it sideways changes the week.
 */
export function Envelope({
  week,
  days,
  isCurrent,
  canGoNext,
  onPrevious,
  onNext,
  onCurrent,
  onOpenDay,
  loading,
}: {
  week: CommissionWeekSummary
  days: DayTotal[]
  isCurrent: boolean
  canGoNext: boolean
  onPrevious: () => void
  onNext: () => void
  onCurrent: () => void
  onOpenDay: (date: string) => void
  /** The week's figures have not arrived yet: show no amount rather than a misleading $0. */
  loading: boolean
}) {
  const { today, money, shareWords } = useCommission()
  const touch = useRef<{ x: number; y: number; at: number } | null>(null)

  const until = daysBetween(today, week.payday)
  const amount = loading ? '—' : money(week.payout ? week.payout.paidCents : week.expectedCents)
  const words = shareWords(week.percentBp)
  let detail: string
  if (loading) {
    detail = ' '
  } else if (week.grossCents === 0) {
    detail = isCurrent
      ? `Anota lo que haces cada día; el ${dayName(week.payday)} te pagan ${words}.`
      : 'No hay ingresos registrados esta semana.'
  } else if (week.payout && week.payout.paidCents !== week.expectedCents) {
    detail = `Lo calculado era ${money(week.expectedCents)}: ${words} de ${money(week.grossCents)}.`
  } else {
    detail = `Es ${words} de los ${money(week.grossCents)} que ${until > 0 ? 'llevas' : 'hiciste'}.`
  }
  const countdown = !loading && !week.payout && isCurrent && until > 1 ? `Faltan ${until} días` : ''
  const max = Math.max(0, ...days.map(({ totalCents }) => totalCents))
  const sharePercent = `${week.percentBp / 100}%`

  return (
    <div className="relative mb-12">
      <section
        aria-label={`Semana del ${rangeLabel(week, today)}`}
        className="@container relative rounded-t-2xl bg-envelope px-4 pt-3 pb-14 text-envelope-foreground [clip-path:polygon(0_0,100%_0,100%_calc(100%-28px),50%_100%,0_calc(100%-28px))] [touch-action:pan-y]"
        onTouchStart={(e) => {
          const t = e.touches[0]
          if (t) touch.current = { x: t.clientX, y: t.clientY, at: Date.now() }
        }}
        onTouchEnd={(e) => {
          const start = touch.current
          const t = e.changedTouches[0]
          touch.current = null
          if (!start || !t) return
          const dx = t.clientX - start.x
          const dy = t.clientY - start.y
          if (
            Date.now() - start.at > 600 ||
            Math.abs(dx) < 60 ||
            Math.abs(dx) < Math.abs(dy) * 1.6
          ) {
            return
          }
          if (dx > 0) onPrevious()
          else if (canGoNext) onNext()
        }}
      >
        <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2">
          <button
            type="button"
            onClick={onPrevious}
            aria-label="Semana anterior"
            className="grid size-11 place-items-center rounded-full bg-envelope-foreground/15 focus-visible:outline-envelope-accent"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <div className="min-w-0 text-center">
            <div className="text-lg font-bold">{rangeLabel(week, today)}</div>
            {!isCurrent && (
              <button
                type="button"
                onClick={onCurrent}
                className="text-sm font-semibold text-envelope-accent underline underline-offset-4"
              >
                Ir a la semana actual
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label="Semana siguiente"
            className="grid size-11 place-items-center rounded-full bg-envelope-foreground/15 disabled:opacity-30"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>

        <p className="mt-4 text-envelope-muted">
          {loading ? 'Cargando tus datos…' : headline(week, today, isCurrent)}
        </p>
        <p
          className="mt-1 mb-3 font-heading text-[length:clamp(2.5rem,calc(170cqi/var(--chars)),8rem)] leading-[0.9] font-extrabold tracking-tight whitespace-nowrap text-envelope-accent tabular-nums"
          style={{ '--chars': String(Math.max(4, amount.length)) } as CSSProperties}
        >
          {amount}
        </p>
        <p className="max-w-[36ch] text-[0.95rem] text-envelope-muted">{detail}</p>

        <div className="mt-5 grid h-36 grid-cols-7 gap-1.5">
          {days.map(({ date, totalCents }) => {
            const height = totalCents > 0 && max > 0 ? Math.max(6, (totalCents / max) * 100) : 0
            const isToday = date === today
            return (
              <button
                key={date}
                type="button"
                onClick={() => onOpenDay(date)}
                aria-label={`${capitalize(dayLabel(date))}: ${totalCents > 0 ? money(totalCents) : 'sin ingresos'}`}
                className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg focus-visible:outline-envelope-accent"
              >
                <span className="flex w-full flex-1 items-end justify-center">
                  {totalCents > 0 ? (
                    <span
                      className="relative w-full max-w-[34px] overflow-hidden rounded-t-md rounded-b-sm bg-envelope-foreground/15 ring-1 ring-envelope-foreground/40 ring-inset transition-[height] duration-500"
                      style={{ height: `${height}%` }}
                    >
                      <span
                        className="absolute inset-x-0 bottom-0 bg-envelope-accent"
                        style={{ height: sharePercent }}
                      />
                    </span>
                  ) : (
                    <span className="h-[3px] w-full max-w-[34px] rounded-sm bg-envelope-foreground/25" />
                  )}
                </span>
                <span
                  className={`flex flex-col items-center text-xs leading-tight ${
                    isToday ? 'font-bold text-envelope-foreground' : 'text-envelope-muted'
                  }`}
                >
                  <span className="font-semibold">{dayInitials(date)}</span>
                  <span>{dayNumber(date)}</span>
                  <span
                    aria-hidden
                    className={`mt-0.5 size-1.5 rounded-full ${isToday ? 'bg-envelope-accent' : ''}`}
                  />
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex items-center gap-4 text-sm text-envelope-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-envelope-accent" />
            Tu parte
          </span>
          {week.percentBp < 10_000 && (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm bg-envelope-foreground/15 ring-1 ring-envelope-foreground/40 ring-inset"
              />
              El resto
            </span>
          )}
          {countdown && (
            <span className="ml-auto font-semibold text-envelope-foreground">{countdown}</span>
          )}
        </div>
      </section>

      <div
        aria-hidden
        className={`absolute bottom-[-33px] left-1/2 -ml-[33px] flex size-[66px] -rotate-[7deg] flex-col items-center justify-center rounded-full border-4 border-background leading-none ${
          // Paid: a light seal with a green check, which stands out on every envelope colour.
          week.payout
            ? 'bg-card text-success'
            : 'bg-envelope-accent text-envelope-accent-foreground'
        }`}
      >
        <span className="flex text-xs font-bold">
          {week.payout ? (
            <Check className="size-4" strokeWidth={3} />
          ) : (
            dayAbbreviation(week.payday)
          )}
        </span>
        <span className="mt-0.5 font-heading text-2xl font-extrabold">
          {dayNumber(week.payday)}
        </span>
      </div>
    </div>
  )
}

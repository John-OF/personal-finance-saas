import { commissionWeekOf, currencySymbol, formatMoney, type CommissionPlan } from '@pf/shared'
import { SlidersHorizontal } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { useMe } from '../../app/me-context'
import { useLoad } from '../../lib/use-load'
import { useToday } from '../../lib/use-today'
import { commissionApi } from './api'
import { CommissionContext, type CommissionState } from './commission-context'
import { PlanForm } from './PlanForm'

const PLAN_KEY = 'libreta:commission:plan'

function storedPlanId() {
  try {
    return localStorage.getItem(PLAN_KEY)
  } catch {
    return null
  }
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-destructive">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-border px-4 py-2 hover:bg-muted"
      >
        Reintentar
      </button>
    </div>
  )
}

/** /commission and its pages: loads the plans; the first visit sets one up. */
export function CommissionLayout() {
  const loadPlans = useCallback(() => commissionApi.plans(), [])
  const { data, error, reload } = useLoad(loadPlans)

  if (error) return <LoadError message={error} onRetry={reload} />
  if (!data) return <p className="text-muted-foreground">Cargando…</p>
  if (data.plans.length === 0) {
    return (
      <section className="flex flex-col gap-4 rounded border border-border bg-card p-5">
        <h2 className="text-2xl">Ingresos por comisión</h2>
        <p className="text-sm text-muted-foreground">
          Anota lo que haces cada día y la app calcula cuánto te toca el día de pago. Si ya usabas
          el archivo «Mis ingresos», después podrás importar su CSV desde los ajustes.
        </p>
        <PlanForm defaultName="Mis ingresos" submitLabel="Empezar" onCreated={reload} />
      </section>
    )
  }
  return <PlanScope plans={data.plans} reloadPlans={reload} />
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex h-10 items-center justify-center rounded-md text-sm font-semibold ${
    isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
  }`

function PlanScope({ plans, reloadPlans }: { plans: CommissionPlan[]; reloadPlans: () => void }) {
  const { me } = useMe()
  const { timezone, locale, currency } = me.profile
  const [selectedId, setSelectedId] = useState(storedPlanId)
  // PlanScope only renders with at least one plan.
  const plan = plans.find(({ id }) => id === selectedId) ?? plans[0]!
  const today = useToday(timezone)

  const loadWeeks = useCallback(() => commissionApi.weeks(plan.id), [plan.id])
  const weeks = useLoad(loadWeeks)

  const value = useMemo<CommissionState>(() => {
    const percentFormat = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 2,
    })
    const percent = (bp: number) => percentFormat.format(bp / 10_000)
    return {
      plans,
      plan,
      selectPlan: (planId) => {
        setSelectedId(planId)
        try {
          localStorage.setItem(PLAN_KEY, planId)
        } catch {
          // Without storage the choice lasts until the page is reloaded.
        }
      },
      reloadPlans,
      weeks: weeks.data?.weeks,
      reloadWeeks: weeks.reload,
      today,
      currentPayday: commissionWeekOf(today, plan).payday,
      money: (cents) => formatMoney(cents, { currency, locale, trimZeroCents: true }),
      percent,
      shareWords: (bp) => (bp === 5000 ? 'la mitad' : `el ${percent(bp)}`),
      symbol: currencySymbol(currency, locale),
    }
  }, [plans, plan, reloadPlans, weeks.data, weeks.reload, today, currency, locale])

  return (
    <CommissionContext value={value}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          {plans.length > 1 ? (
            <select
              aria-label="Plan"
              value={plan.id}
              onChange={(e) => value.selectPlan(e.target.value)}
              className="min-w-0 rounded border border-input bg-card px-3 py-2 font-heading text-xl"
            >
              {plans.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="text-2xl">{plan.name}</h2>
          )}
          <Link
            to="/commission/settings"
            aria-label="Ajustes del plan"
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
          >
            <SlidersHorizontal aria-hidden className="size-5" />
          </Link>
        </div>
        <nav
          aria-label="Vista"
          className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1"
        >
          <NavLink to="/commission" end className={tabClass}>
            Semana
          </NavLink>
          <NavLink to="/commission/history" className={tabClass}>
            Historial
          </NavLink>
        </nav>
        {weeks.error ? (
          <LoadError message={weeks.error} onRetry={weeks.reload} />
        ) : (
          // A new plan starts its pages afresh (forms, notices dismissed, open day).
          <div key={plan.id}>
            <Outlet />
          </div>
        )}
      </div>
    </CommissionContext>
  )
}

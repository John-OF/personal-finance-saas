import {
  isMonthKey,
  monthOf,
  monthRange,
  netWorthCents,
  savingsRateBp,
  addDays,
  type MonthSummary,
} from '@pf/shared'
import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMe } from '../../app/me-context'
import { LoadError } from '../../components/ui/load-error'
import { dayNumber, shortDate } from '../../lib/labels'
import { useLoad } from '../../lib/use-load'
import { useMoney } from '../../lib/use-money'
import { useToday } from '../../lib/use-today'
import { financeApi } from './api'
import { FirstAccount } from './FirstAccount'
import { ACCOUNT_TYPE_ICONS } from './labels'
import { MonthNav } from './MonthNav'
import { QuickAddButton } from './QuickAddButton'
import { TransactionList } from './TransactionList'
import { byId, useFinanceData, type FinanceData } from './use-finance-data'

const cardClass = 'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4'

/** Inicio with the finances module: the "Resumen" of the prototype, with real data (plan §3.11). */
export function SummaryView() {
  const { data, error, reload } = useFinanceData()
  if (error) return <LoadError message={error} onRetry={reload} />
  if (!data) return <p className="text-muted-foreground">Cargando…</p>
  if (data.accounts.length === 0) return <FirstAccount onCreated={reload} />
  return <Summary data={data} />
}

function Summary({ data }: { data: FinanceData }) {
  const { me } = useMe()
  const { money } = useMoney()
  const today = useToday(me.profile.timezone)
  const currentMonth = monthOf(today)
  const [params, setParams] = useSearchParams()
  const requested = params.get('mes')
  const month =
    requested && isMonthKey(requested) && requested <= currentMonth ? requested : currentMonth

  const loadSummary = useCallback(() => financeApi.monthSummary(month), [month])
  const summary = useLoad(loadSummary)
  const loadRecent = useCallback(() => financeApi.transactions({ limit: 5 }), [])
  const recent = useLoad(loadRecent)
  const accounts = useMemo(() => byId(data.accounts), [data.accounts])
  const categories = useMemo(() => byId(data.categories), [data.categories])
  const openAccounts = data.accounts.filter(({ archived }) => !archived)
  const netWorth = netWorthCents(data.accounts)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 className="text-2xl">
          Hola{me.profile.displayName ? `, ${me.profile.displayName}` : ''}
        </h2>
        <p className="text-right">
          <span className="block text-xs tracking-wide text-muted-foreground uppercase">
            Patrimonio neto
          </span>
          <span
            className={`font-heading text-2xl font-bold tabular-nums ${netWorth < 0 ? 'text-destructive' : ''}`}
          >
            {money(netWorth)}
          </span>
        </p>
      </div>

      <MonthNav
        month={month}
        currentMonth={currentMonth}
        onChange={(target) => setParams(target === currentMonth ? {} : { mes: target })}
      />

      {summary.error ? (
        <LoadError message={summary.error} onRetry={summary.reload} />
      ) : (
        <MonthFigures
          summary={summary.data}
          lastDay={month === currentMonth ? today : monthRange(month).to}
          month={month}
          categoryNames={(id) => categories.get(id)?.name ?? 'Sin categoría'}
        />
      )}

      <section className={cardClass}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-bold">Cuentas</h3>
          <Link to="/accounts" className="text-sm font-semibold text-link hover:underline">
            Gestionar
          </Link>
        </div>
        <ul className="flex flex-col">
          {openAccounts.map((account) => {
            const Icon = ACCOUNT_TYPE_ICONS[account.type]
            return (
              <li
                key={account.id}
                className="flex items-center gap-3 border-t border-dashed border-border py-2 first:border-t-0"
              >
                <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{account.name}</span>
                <span
                  className={`font-bold tabular-nums ${account.balanceCents < 0 ? 'text-destructive' : ''}`}
                >
                  {money(account.balanceCents)}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-bold">Últimos movimientos</h3>
          <Link to="/transactions" className="text-sm font-semibold text-link hover:underline">
            Ver todos
          </Link>
        </div>
        {recent.error ? (
          <LoadError message={recent.error} onRetry={recent.reload} />
        ) : !recent.data ? (
          <p className="text-muted-foreground">Cargando…</p>
        ) : recent.data.transactions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-center text-muted-foreground">
            Todavía no anotas nada.{' '}
            <Link
              to="/transactions"
              state={{ quickAdd: true }}
              className="font-semibold text-link underline"
            >
              Anota el primer movimiento
            </Link>
          </p>
        ) : (
          <TransactionList
            transactions={recent.data.transactions}
            accounts={accounts}
            categories={categories}
            showDays={false}
          />
        )}
      </section>

      <QuickAddButton />
    </div>
  )
}

function MonthFigures({
  summary,
  month,
  lastDay,
  categoryNames,
}: {
  summary: MonthSummary | undefined
  month: string
  /** Today in the current month, the last day in a past one. */
  lastDay: string
  categoryNames: (categoryId: string) => string
}) {
  const { money } = useMoney()
  const income = summary?.incomeCents ?? 0
  const expense = summary?.expenseCents ?? 0
  const left = income - expense
  const rate = savingsRateBp(income, expense)
  const loading = !summary
  const expenses = summary?.categories.filter(({ kind }) => kind === 'expense') ?? []
  const topExpense = Math.max(1, ...expenses.map(({ totalCents }) => totalCents))

  // The ribbon of the prototype: where each dollar that came in went.
  const ribbon = [
    { label: 'Gastos', cents: expense, className: 'bg-destructive' },
    { label: 'Te queda', cents: Math.max(0, left), className: 'bg-success' },
  ]
  const ribbonTotal = ribbon.reduce((sum, { cents }) => sum + cents, 0)

  return (
    <>
      <section className="grid grid-cols-3 gap-2" aria-busy={loading}>
        {[
          { label: 'Entró', cents: income, className: 'text-success' },
          { label: 'Salió', cents: expense, className: 'text-destructive' },
          {
            label: 'Te queda',
            cents: left,
            className: left < 0 ? 'text-destructive' : 'text-success',
          },
        ].map(({ label, cents, className }) => (
          <div key={label} className="rounded-2xl border border-border bg-card px-3 py-3">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
            <p className={`truncate text-lg font-bold tabular-nums sm:text-2xl ${className}`}>
              {loading ? '…' : money(cents)}
            </p>
          </div>
        ))}
      </section>

      {ribbonTotal > 0 && (
        <section className={cardClass}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-lg font-bold">A dónde va lo que entra</h3>
            {rate !== null && (
              <p className="text-sm text-muted-foreground">
                {rate >= 0
                  ? `Guardas el ${Math.round(rate / 100)} % de lo que entra`
                  : `Gastas ${Math.round(-rate / 100)} % más de lo que entra`}
              </p>
            )}
          </div>
          <div className="flex h-4 overflow-hidden rounded-full bg-muted" aria-hidden>
            {ribbon.map(({ label, cents, className }) => (
              <div
                key={label}
                className={className}
                style={{ width: `${(cents / ribbonTotal) * 100}%` }}
              />
            ))}
          </div>
          <p className="flex flex-wrap gap-x-4 text-sm">
            {ribbon.map(({ label, cents, className }) => (
              <span key={label} className="flex items-center gap-1.5">
                <i aria-hidden className={`inline-block size-2.5 rounded-full ${className}`} />
                {label} <b className="tabular-nums">{money(cents)}</b>
              </span>
            ))}
          </p>
          {left < 0 && (
            <p className="text-sm text-destructive">
              Este mes salió {money(-left)} más de lo que entró.
            </p>
          )}
        </section>
      )}

      {summary && summary.days.length > 0 && (
        <DailyBars summary={summary} month={month} lastDay={lastDay} />
      )}

      {expenses.length > 0 && (
        <section className={cardClass}>
          <h3 className="text-lg font-bold">En qué se te va</h3>
          <ul className="flex flex-col gap-2">
            {expenses.map(({ categoryId, totalCents }) => (
              <li key={categoryId} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
                <span className="truncate text-sm">{categoryNames(categoryId)}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-destructive"
                    style={{ width: `${(totalCents / topExpense) * 100}%` }}
                  />
                </span>
                <b className="text-sm tabular-nums">{money(totalCents)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** One stem per day: what came in above the line and what went out below, as in the prototype. */
function DailyBars({
  summary,
  month,
  lastDay,
}: {
  summary: MonthSummary
  month: string
  lastDay: string
}) {
  const { money } = useMoney()
  const byDate = new Map(summary.days.map((day) => [day.date, day]))
  const dates: string[] = []
  for (let date = monthRange(month).from; date <= lastDay; date = addDays(date, 1)) dates.push(date)
  const top = Math.max(1, ...summary.days.map((d) => Math.max(d.incomeCents, d.expenseCents)))

  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-lg font-bold">Día a día</h3>
        <p className="text-sm text-muted-foreground">Arriba lo que entra · abajo lo que sale</p>
      </div>
      <div className="flex h-32 items-stretch gap-px" aria-hidden>
        {dates.map((date) => {
          const day = byDate.get(date)
          return (
            <div
              key={date}
              className="flex min-w-0 flex-1 flex-col"
              title={`${shortDate(date)} · entró ${money(day?.incomeCents ?? 0)} · salió ${money(day?.expenseCents ?? 0)}`}
            >
              <div className="flex flex-1 items-end justify-center">
                <span
                  className="w-full max-w-2 rounded-t-sm bg-success"
                  style={{ height: `${((day?.incomeCents ?? 0) / top) * 100}%` }}
                />
              </div>
              <div className="h-px bg-border" />
              <div className="flex flex-1 items-start justify-center">
                <span
                  className="w-full max-w-2 rounded-b-sm bg-destructive"
                  style={{ height: `${((day?.expenseCents ?? 0) / top) * 100}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{dayNumber(dates[0] ?? '')}</span>
        <span>{dayNumber(lastDay)}</span>
      </div>
    </section>
  )
}

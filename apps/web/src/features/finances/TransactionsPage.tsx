import {
  isMonthKey,
  monthOf,
  monthRange,
  parseAmountToCents,
  TRANSACTION_SEARCH_MAX_LENGTH,
  transactionInputSchema,
  formErrors,
  type Transaction,
  type TransactionKind,
  type TransactionsQuery,
} from '@pf/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { useMe } from '../../app/me-context'
import { LoadError } from '../../components/ui/load-error'
import { useToast } from '../../components/ui/toast-context'
import { amountText, dayLabel } from '../../lib/labels'
import { useMoney } from '../../lib/use-money'
import { useToday } from '../../lib/use-today'
import { describeFailure } from '../auth/submit'
import { financeApi } from './api'
import { FirstAccount } from './FirstAccount'
import { KIND_NOUNS, transactionTitle } from './labels'
import { MonthNav } from './MonthNav'
import { TransactionForm, type TransactionDraft } from './TransactionForm'
import { TransactionList } from './TransactionList'
import { byId, useFinanceData, type FinanceData } from './use-finance-data'
import { useTransactionList } from './use-transaction-list'

const ACCOUNT_KEY = 'libreta:finances:account'

function rememberedAccount() {
  try {
    return localStorage.getItem(ACCOUNT_KEY)
  } catch {
    return null
  }
}

function scrollIntoView(id: string) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
}

/** /transactions: the day to day of the "Libreta" prototype (plan §3.3). */
export function TransactionsPage() {
  const { data, error, reload } = useFinanceData()
  if (error) return <LoadError message={error} onRetry={reload} />
  if (!data) return <p className="text-muted-foreground">Cargando…</p>
  if (data.accounts.length === 0) return <FirstAccount onCreated={reload} />
  return <TransactionsView data={data} reloadData={reload} />
}

interface Filters {
  kind: TransactionKind | ''
  accountId: string
  categoryId: string
  q: string
  allMonths: boolean
}

const NO_FILTERS: Filters = { kind: '', accountId: '', categoryId: '', q: '', allMonths: false }

const selectClass = 'h-11 min-w-0 rounded-xl border border-border bg-card px-3 text-base'

function TransactionsView({ data, reloadData }: { data: FinanceData; reloadData: () => void }) {
  const { timezone } = useMe().me.profile
  const { money, signed, locale } = useMoney()
  const toast = useToast()
  const today = useToday(timezone)
  const currentMonth = monthOf(today)
  const [params, setParams] = useSearchParams()
  const requested = params.get('mes')
  const month =
    requested && isMonthKey(requested) && requested <= currentMonth ? requested : currentMonth
  const goMonth = (target: string) => setParams(target === currentMonth ? {} : { mes: target })

  const accounts = useMemo(() => byId(data.accounts), [data.accounts])
  const categories = useMemo(() => byId(data.categories), [data.categories])

  // Filters; the search is applied once typing stops.
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [search, setSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => ({ ...f, q: search.trim() })), 300)
    return () => clearTimeout(timer)
  }, [search])
  const activeFilters =
    [filters.kind, filters.accountId, filters.categoryId, filters.q].filter(Boolean).length +
    (filters.allMonths ? 1 : 0)
  const query = useMemo<TransactionsQuery>(() => {
    const { from, to } = monthRange(month)
    return {
      ...(!filters.allMonths && { from, to }),
      ...(filters.kind && { kind: filters.kind }),
      ...(filters.accountId && { accountId: filters.accountId }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.q && { q: filters.q }),
    }
  }, [month, filters])
  const list = useTransactionList(query)
  const refresh = () => {
    list.reload()
    reloadData()
  }

  // The quick entry.
  const openAccounts = data.accounts.filter(({ archived }) => !archived)
  const defaultAccountId = () => {
    const remembered = rememberedAccount()
    return openAccounts.find(({ id }) => id === remembered)?.id ?? openAccounts[0]?.id ?? ''
  }
  const emptyDraft = (kind: TransactionKind = 'expense'): TransactionDraft => ({
    editingId: null,
    kind,
    amount: '',
    date: today,
    accountId: defaultAccountId(),
    toAccountId: '',
    categoryId: '',
    note: '',
  })
  const [draft, setDraft] = useState<TransactionDraft>(() => emptyDraft())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  // Coming from the "+" button: straight to the amount.
  const { state } = useLocation() as { state: { quickAdd?: boolean } | null }
  useEffect(() => {
    if (state?.quickAdd) amountRef.current?.focus()
  }, [state])

  function focusForm() {
    amountRef.current?.focus({ preventScroll: true })
    scrollIntoView('transaction-form')
  }

  async function save() {
    const amountCents = parseAmountToCents(draft.amount)
    if (amountCents === null || amountCents <= 0) {
      setFormError('Escribe un monto mayor a cero, por ejemplo 25 o 25,50.')
      amountRef.current?.focus()
      return
    }
    const common = {
      date: draft.date,
      amountCents,
      accountId: draft.accountId,
      note: draft.note.trim(),
    }
    const input =
      draft.kind === 'transfer'
        ? { ...common, kind: draft.kind, toAccountId: draft.toAccountId }
        : { ...common, kind: draft.kind, categoryId: draft.categoryId }
    const invalid = formErrors(transactionInputSchema, input)
    if (invalid) {
      setFormError(Object.values(invalid).flat()[0] ?? 'Revisa los datos.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const saved = draft.editingId
        ? await financeApi.updateTransaction(draft.editingId, transactionInputSchema.parse(input))
        : await financeApi.createTransaction(transactionInputSchema.parse(input))
      try {
        localStorage.setItem(ACCOUNT_KEY, saved.accountId)
      } catch {
        // Without storage the first account is offered next time.
      }
      toast(
        draft.editingId
          ? 'Cambios guardados'
          : `Guardado: ${describe(saved)} el ${dayLabel(saved.date)}`,
      )
      setDraft({ ...emptyDraft(draft.kind), accountId: saved.accountId })
      ;(document.activeElement as HTMLElement | null)?.blur()
      if (!filters.allMonths && monthOf(saved.date) !== month) goMonth(monthOf(saved.date))
      refresh()
    } catch (err) {
      setFormError(describeFailure(err).message)
    } finally {
      setSaving(false)
    }
  }

  function describe(transaction: Transaction) {
    const amount =
      transaction.kind === 'transfer'
        ? money(transaction.amountCents)
        : signed(transaction.amountCents, transaction.kind === 'income' ? 1 : -1)
    return `${amount} · ${transactionTitle(transaction, accounts, categories)}`
  }

  async function remove(transaction: Transaction) {
    if (draft.editingId === transaction.id) setDraft(emptyDraft())
    try {
      await financeApi.deleteTransaction(transaction.id)
      refresh()
      toast(`Borrado: ${describe(transaction)}`, {
        action: {
          label: 'Deshacer',
          run: () => {
            financeApi
              .restoreTransaction(transaction.id)
              .then(refresh, () => toast('No se pudo deshacer.'))
          },
        },
      })
    } catch (err) {
      toast(describeFailure(err).message)
    }
  }

  function edit(transaction: Transaction) {
    setDraft({
      editingId: transaction.id,
      kind: transaction.kind,
      amount: amountText(transaction.amountCents, locale),
      date: transaction.date,
      accountId: transaction.accountId,
      toAccountId: transaction.toAccountId ?? '',
      categoryId: transaction.categoryId ?? '',
      note: transaction.note,
    })
    setFormError(null)
    focusForm()
  }

  const filterCategories = data.categories.filter(
    ({ kind }) => !filters.kind || filters.kind === kind,
  )
  const { totals } = list

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl">Movimientos</h2>
      <TransactionForm
        draft={draft}
        onChange={(next) => {
          setDraft(next)
          setFormError(null)
        }}
        accounts={data.accounts}
        categories={data.categories}
        today={today}
        busy={saving}
        error={formError}
        onSubmit={() => void save()}
        onCancel={() => {
          setDraft(emptyDraft())
          setFormError(null)
        }}
        amountRef={amountRef}
      />

      <div className="mt-3">
        {filters.allMonths ? (
          <p className="text-center font-heading text-xl">Todos los meses</p>
        ) : (
          <MonthNav month={month} currentMonth={currentMonth} onChange={goMonth} />
        )}
      </div>

      <details className="rounded-xl border border-border bg-card" open={activeFilters > 0}>
        <summary className="cursor-pointer px-4 py-3 font-semibold">
          Filtrar{activeFilters > 0 && ` (${activeFilters})`}
        </summary>
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
          <input
            type="search"
            aria-label="Buscar en las notas y categorías"
            placeholder="Buscar…"
            maxLength={TRANSACTION_SEARCH_MAX_LENGTH}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${selectClass} sm:col-span-2`}
          />
          <select
            aria-label="Tipo"
            value={filters.kind}
            onChange={(e) =>
              setFilters((f) => ({ ...f, kind: e.target.value as Filters['kind'], categoryId: '' }))
            }
            className={selectClass}
          >
            <option value="">Todos los tipos</option>
            <option value="expense">Gastos</option>
            <option value="income">Ingresos</option>
            <option value="transfer">Entre cuentas</option>
          </select>
          <select
            aria-label="Cuenta"
            value={filters.accountId}
            onChange={(e) => setFilters((f) => ({ ...f, accountId: e.target.value }))}
            className={selectClass}
          >
            <option value="">Todas las cuentas</option>
            {data.accounts.map(({ id, name, archived }) => (
              <option key={id} value={id}>
                {archived ? `${name} (archivada)` : name}
              </option>
            ))}
          </select>
          {filters.kind !== 'transfer' && (
            <select
              aria-label="Categoría"
              value={filters.categoryId}
              onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
              className={selectClass}
            >
              <option value="">Todas las categorías</option>
              {filterCategories.map(({ id, name, kind }) => (
                <option key={id} value={id}>
                  {filters.kind ? name : `${name} (${KIND_NOUNS[kind]})`}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.allMonths}
              onChange={(e) => setFilters((f) => ({ ...f, allMonths: e.target.checked }))}
              className="size-4"
            />
            En todos los meses
          </label>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilters(NO_FILTERS)
                setSearch('')
              }}
              className="h-10 justify-self-start rounded-lg px-2 text-sm font-semibold text-link hover:bg-muted"
            >
              Quitar filtros
            </button>
          )}
        </div>
      </details>

      {totals && totals.count > 0 && (
        <p className="text-sm text-muted-foreground">
          {totals.count === 1 ? '1 movimiento' : `${totals.count} movimientos`}
          {totals.incomeCents > 0 && (
            <>
              {' '}
              · entró <b className="text-success tabular-nums">{money(totals.incomeCents)}</b>
            </>
          )}
          {totals.expenseCents > 0 && (
            <>
              {' '}
              · salió <b className="text-destructive tabular-nums">{money(totals.expenseCents)}</b>
            </>
          )}
        </p>
      )}

      {list.error ? (
        <LoadError message={list.error} onRetry={list.reload} />
      ) : !list.transactions ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : list.transactions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-5 text-center text-muted-foreground">
          {activeFilters > 0
            ? 'Nada coincide con los filtros.'
            : month === currentMonth
              ? 'Todavía no anotas nada este mes. Empieza por el gasto de hoy.'
              : 'No hay movimientos en este mes.'}
        </p>
      ) : (
        <>
          <TransactionList
            transactions={list.transactions}
            accounts={accounts}
            categories={categories}
            onEdit={edit}
            onDelete={(transaction) => void remove(transaction)}
          />
          {list.hasMore && (
            <button
              type="button"
              disabled={list.loadingMore}
              onClick={() => {
                list.loadMore().catch((err: unknown) => toast(describeFailure(err).message))
              }}
              className="h-11 rounded-xl border border-border font-semibold hover:bg-muted disabled:opacity-50"
            >
              {list.loadingMore ? 'Cargando…' : 'Cargar más'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

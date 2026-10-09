import {
  addDays,
  isDateKey,
  TRANSACTION_NOTE_MAX_LENGTH,
  type Account,
  type Category,
  type TransactionKind,
} from '@pf/shared'
import type { FormEvent, RefObject } from 'react'
import { Link } from 'react-router'
import { FormAlert } from '../../components/ui/form'
import { useMoney } from '../../lib/use-money'
import { KIND_LABELS, KIND_NOUNS } from './labels'

export interface TransactionDraft {
  /** Set while editing a transaction. */
  editingId: string | null
  kind: TransactionKind
  amount: string
  date: string
  accountId: string
  /** Transfers only. */
  toAccountId: string
  /** Income and expenses only. */
  categoryId: string
  note: string
}

/** Expenses first, as in the prototype: they are what gets recorded most. */
const KIND_ORDER: TransactionKind[] = ['expense', 'income', 'transfer']

/** Categories offered as buttons; the rest go in a list. */
const CHIP_COUNT = 8

const chipClass =
  'h-10 shrink-0 rounded-full border border-border px-4 text-[0.95rem] font-semibold aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background'
const fieldClass =
  'h-12 rounded-xl border-2 border-transparent bg-muted px-4 outline-none focus:border-primary focus:bg-card'

/** Most used first (plan §3.3), then by name; the one already chosen is always there. */
function categoryChoices(categories: Category[], kind: TransactionKind, selectedId: string) {
  const ofKind = categories
    .filter((c) => c.kind === kind && (!c.archived || c.id === selectedId))
    .sort((a, b) => b.recentUseCount - a.recentUseCount || a.name.localeCompare(b.name, 'es'))
  let chips = ofKind.slice(0, CHIP_COUNT)
  const selected = ofKind.find(({ id }) => id === selectedId)
  if (selected && !chips.includes(selected)) chips = [...chips.slice(0, CHIP_COUNT - 1), selected]
  return { chips, rest: ofKind.filter((c) => !chips.includes(c)) }
}

/** Open accounts, plus the one already chosen even if it was archived since. */
const accountChoices = (accounts: Account[], ...selected: string[]) =>
  accounts.filter((a) => !a.archived || selected.includes(a.id))

/**
 * The quick entry (plan §3.3): what kind, a big amount, Hoy / Ayer / a date, the category (most
 * used first), the account and a note.
 */
export function TransactionForm({
  draft,
  onChange,
  accounts,
  categories,
  today,
  busy,
  error,
  onSubmit,
  onCancel,
  amountRef,
}: {
  draft: TransactionDraft
  onChange: (draft: TransactionDraft) => void
  accounts: Account[]
  categories: Category[]
  today: string
  busy: boolean
  error: string | null
  onSubmit: () => void
  onCancel: () => void
  amountRef: RefObject<HTMLInputElement | null>
}) {
  const { symbol } = useMoney()
  const set = (fields: Partial<TransactionDraft>) => onChange({ ...draft, ...fields })
  const isTransfer = draft.kind === 'transfer'
  const { chips, rest } = categoryChoices(categories, draft.kind, draft.categoryId)
  const fromChoices = accountChoices(accounts, draft.accountId)
  const toChoices = accountChoices(accounts, draft.toAccountId).filter(
    ({ id }) => id !== draft.accountId,
  )
  const canTransfer = accountChoices(accounts).length > 1

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  function changeKind(kind: TransactionKind) {
    if (kind === draft.kind) return
    // A category belongs to one kind, and a transfer needs a second account.
    const toAccountId =
      kind === 'transfer' && !draft.toAccountId
        ? (toChoices.find(({ id }) => id !== draft.accountId)?.id ?? '')
        : draft.toAccountId
    set({ kind, categoryId: '', toAccountId })
  }

  return (
    <section
      aria-labelledby="transaction-title"
      className="rounded-2xl border border-border bg-card p-4"
      id="transaction-form"
    >
      <h3 id="transaction-title" className="mb-3 text-lg font-bold">
        {draft.editingId ? `Editar ${KIND_NOUNS[draft.kind]}` : 'Anotar un movimiento'}
      </h3>
      <form noValidate onSubmit={submit} className="flex flex-col gap-3">
        <div
          role="group"
          aria-label="Tipo de movimiento"
          className="grid grid-cols-3 gap-1 rounded-xl border border-border p-1"
        >
          {KIND_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={draft.kind === kind}
              onClick={() => changeKind(kind)}
              className="h-10 rounded-lg text-sm font-semibold text-muted-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>

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
            aria-label="Fecha"
            value={draft.date}
            max={today}
            onChange={(e) => {
              if (isDateKey(e.target.value)) set({ date: e.target.value })
            }}
            className="h-10 min-w-0 flex-1 rounded-full border border-border bg-transparent px-4 text-[0.95rem]"
          />
        </div>

        {isTransfer ? (
          canTransfer ? (
            <div className="grid grid-cols-2 gap-2">
              <AccountSelect
                label="Sale de"
                value={draft.accountId}
                accounts={fromChoices}
                onChange={(accountId) =>
                  set({
                    accountId,
                    toAccountId: draft.toAccountId === accountId ? '' : draft.toAccountId,
                  })
                }
              />
              <AccountSelect
                label="Entra a"
                value={draft.toAccountId}
                accounts={toChoices}
                placeholder="Elige"
                onChange={(toAccountId) => set({ toAccountId })}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Para mover dinero entre cuentas necesitas al menos dos.{' '}
              <Link to="/accounts" className="font-semibold text-link underline">
                Crear otra cuenta
              </Link>
            </p>
          )
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 flex w-full items-baseline justify-between text-sm">
              <span>Categoría</span>
              <Link to="/categories" className="font-semibold text-link hover:underline">
                Gestionar
              </Link>
            </legend>
            <div className="flex flex-wrap gap-2">
              {chips.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={draft.categoryId === category.id}
                  onClick={() => set({ categoryId: category.id })}
                  className={chipClass}
                >
                  {category.name}
                </button>
              ))}
            </div>
            {rest.length > 0 && (
              <select
                aria-label="Otra categoría"
                value={rest.some(({ id }) => id === draft.categoryId) ? draft.categoryId : ''}
                onChange={(e) => set({ categoryId: e.target.value })}
                className="h-11 rounded-xl border border-border bg-card px-3"
              >
                <option value="">Otra categoría…</option>
                {rest.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </fieldset>
        )}

        {!isTransfer && fromChoices.length > 1 && (
          <AccountSelect
            label="Cuenta"
            value={draft.accountId}
            accounts={fromChoices}
            onChange={(accountId) => set({ accountId })}
          />
        )}

        <input
          type="text"
          maxLength={TRANSACTION_NOTE_MAX_LENGTH}
          autoComplete="off"
          placeholder={
            draft.kind === 'income' ? 'Nota: sueldo, venta, propina…' : 'Nota: almuerzo, bus, luz…'
          }
          aria-label="Nota"
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          className={fieldClass}
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
            disabled={busy || (isTransfer && !canTransfer)}
            className="h-12 flex-1 rounded-xl bg-primary px-5 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? 'Guardando…'
              : draft.editingId
                ? 'Guardar cambios'
                : `Guardar ${KIND_NOUNS[draft.kind]}`}
          </button>
        </div>
      </form>
    </section>
  )
}

function AccountSelect({
  label,
  value,
  accounts,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  accounts: Account[]
  placeholder?: string
  onChange: (accountId: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 min-w-0 rounded-xl border border-border bg-card px-3 text-base"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {accounts.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

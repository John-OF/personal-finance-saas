import { BALANCE_SIGN, type Account, type Category, type Transaction } from '@pf/shared'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { capitalize, dayName, longDate } from '../../lib/labels'
import { useMoney } from '../../lib/use-money'
import { transactionTitle } from './labels'

const amountColor = {
  income: 'text-success',
  expense: 'text-destructive',
  transfer: 'text-foreground',
} as const

/**
 * Transactions by day, newest first. A row opens to Editar / Borrar, so a tap on a phone does not
 * hit them by accident.
 */
export function TransactionList({
  transactions,
  accounts,
  categories,
  showDays = true,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[]
  accounts: Map<string, Account>
  categories: Map<string, Category>
  /** Day headings; off for a short list such as "Últimos movimientos". */
  showDays?: boolean
  onEdit?: (transaction: Transaction) => void
  onDelete?: (transaction: Transaction) => void
}) {
  const { signed, money } = useMoney()
  const [open, setOpen] = useState<string | null>(null)
  const several = accounts.size > 1
  const days: { date: string; items: Transaction[] }[] = []
  for (const transaction of transactions) {
    const last = days.at(-1)
    if (showDays && last?.date === transaction.date) last.items.push(transaction)
    else days.push({ date: transaction.date, items: [transaction] })
  }
  const editable = Boolean(onEdit ?? onDelete)

  return (
    <ul className="overflow-hidden rounded-2xl border border-border bg-card">
      {days.map(({ date, items }, index) => (
        <li key={`${date}-${index}`} className="border-t border-border first:border-t-0">
          {showDays && (
            <h4 className="bg-muted px-4 py-1.5 text-sm font-semibold text-muted-foreground">
              {capitalize(dayName(date))} {longDate(date)}
            </h4>
          )}
          <ul>
            {items.map((transaction) => {
              const isOpen = open === transaction.id
              const details = [
                transaction.note,
                transaction.kind !== 'transfer' && several
                  ? accounts.get(transaction.accountId)?.name
                  : undefined,
                showDays ? undefined : longDate(transaction.date),
              ].filter(Boolean)
              const amount =
                transaction.kind === 'transfer'
                  ? money(transaction.amountCents)
                  : signed(transaction.amountCents, BALANCE_SIGN[transaction.kind])
              const row = (
                <>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {transactionTitle(transaction, accounts, categories)}
                    </span>
                    {details.length > 0 && (
                      <span className="block truncate text-sm text-muted-foreground">
                        {details.join(' · ')}
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-right font-bold tabular-nums ${amountColor[transaction.kind]}`}
                  >
                    {amount}
                  </span>
                </>
              )
              return (
                <li
                  key={transaction.id}
                  className="border-t border-dashed border-border first:border-t-0"
                >
                  {editable ? (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : transaction.id)}
                      className="grid min-h-14 w-full grid-cols-[1fr_auto_18px] items-center gap-3 py-2 pr-3.5 pl-4 text-left"
                    >
                      {row}
                      <ChevronDown
                        aria-hidden
                        className={`size-[18px] text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  ) : (
                    <div className="grid min-h-14 grid-cols-[1fr_auto] items-center gap-3 py-2 pr-4 pl-4">
                      {row}
                    </div>
                  )}
                  {isOpen && (
                    <div className="flex gap-1.5 px-4 pb-3">
                      {onEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(null)
                            onEdit(transaction)
                          }}
                          className="h-9 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted"
                        >
                          Editar
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(null)
                            onDelete(transaction)
                          }}
                          className="h-9 rounded-lg px-3 text-sm font-semibold text-destructive hover:bg-muted"
                        >
                          Borrar
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}

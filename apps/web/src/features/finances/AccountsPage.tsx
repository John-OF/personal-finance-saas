import { netWorthCents, type Account } from '@pf/shared'
import { useState } from 'react'
import { LoadError } from '../../components/ui/load-error'
import { useToast } from '../../components/ui/toast-context'
import { useMoney } from '../../lib/use-money'
import { describeFailure } from '../auth/submit'
import { AccountForm } from './AccountForm'
import { financeApi } from './api'
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS } from './labels'
import { QuickAddButton } from './QuickAddButton'
import { useFinanceData } from './use-finance-data'

const cardClass = 'flex flex-col gap-4 rounded-2xl border border-border bg-card p-4'

/** /accounts: where the money is (plan §3.2). */
export function AccountsPage() {
  const { data, error, reload } = useFinanceData()
  const { money } = useMoney()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (error) return <LoadError message={error} onRetry={reload} />
  if (!data) return <p className="text-muted-foreground">Cargando…</p>

  const open = data.accounts.filter(({ archived }) => !archived)
  const archived = data.accounts.filter((account) => account.archived)
  const netWorth = netWorthCents(data.accounts)

  async function setArchived(account: Account, value: boolean) {
    try {
      await financeApi.updateAccount(account.id, { archived: value })
      setEditing(null)
      reload()
      toast(value ? `Archivada: ${account.name}` : `Reabierta: ${account.name}`, {
        action: {
          label: 'Deshacer',
          run: () => {
            financeApi
              .updateAccount(account.id, { archived: !value })
              .then(reload, () => toast('No se pudo deshacer.'))
          },
        },
      })
    } catch (err) {
      toast(describeFailure(err).message)
    }
  }

  async function remove(account: Account) {
    try {
      await financeApi.deleteAccount(account.id)
      setEditing(null)
      reload()
      toast(`Borrada: ${account.name}`)
    } catch (err) {
      toast(describeFailure(err).message)
    }
  }

  const row = (account: Account) => {
    const Icon = ACCOUNT_TYPE_ICONS[account.type]
    if (editing === account.id) {
      return (
        <li key={account.id} className={cardClass}>
          <h3 className="text-lg font-bold">Editar {account.name}</h3>
          <AccountForm
            account={account}
            submitLabel="Guardar cambios"
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await financeApi.updateAccount(account.id, input)
              setEditing(null)
              reload()
              toast('Cambios guardados')
            }}
          />
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => void setArchived(account, !account.archived)}
              className="h-10 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted"
            >
              {account.archived ? 'Reabrir' : 'Archivar'}
            </button>
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={() => void remove(account)}
                  className="h-10 rounded-lg bg-destructive px-3 text-sm font-semibold text-background hover:opacity-90"
                >
                  Sí, borrar {account.name}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="h-10 rounded-lg px-3 text-sm font-semibold hover:bg-muted"
                >
                  No
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="h-10 rounded-lg px-3 text-sm font-semibold text-destructive hover:bg-muted"
              >
                Borrar
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Archivar la oculta y deja de contar en el patrimonio, sin perder sus movimientos. Solo
            se puede borrar una cuenta sin movimientos.
          </p>
        </li>
      )
    }
    return (
      <li key={account.id}>
        <button
          type="button"
          onClick={() => {
            setEditing(account.id)
            setConfirmingDelete(false)
            setAdding(false)
          }}
          aria-label={`Editar ${account.name}`}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left hover:bg-muted"
        >
          <Icon aria-hidden className="size-6 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{account.name}</span>
            <span className="block text-sm text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[account.type]}
              {!account.includeInNetWorth && ' · fuera del patrimonio'}
            </span>
          </span>
          <span
            className={`font-bold tabular-nums ${account.balanceCents < 0 ? 'text-destructive' : ''}`}
          >
            {money(account.balanceCents)}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 className="text-2xl">Cuentas</h2>
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

      {open.length === 0 && !adding && (
        <p className="text-muted-foreground">No tienes cuentas abiertas.</p>
      )}
      <ul className="flex flex-col gap-2">{open.map(row)}</ul>

      {adding ? (
        <section className={cardClass}>
          <h3 className="text-lg font-bold">Nueva cuenta</h3>
          <AccountForm
            defaults={{ name: '', type: 'bank' }}
            submitLabel="Crear cuenta"
            onCancel={() => setAdding(false)}
            onSubmit={async (input) => {
              await financeApi.createAccount(input)
              setAdding(false)
              reload()
              toast(`Cuenta creada: ${input.name}`)
            }}
          />
        </section>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true)
            setEditing(null)
          }}
          className="h-11 rounded-xl border border-dashed border-border font-semibold hover:bg-muted"
        >
          Añadir una cuenta
        </button>
      )}

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="mt-2 text-lg font-bold">Archivadas</h3>
          <ul className="flex flex-col gap-2 opacity-80">{archived.map(row)}</ul>
        </section>
      )}

      <QuickAddButton />
    </div>
  )
}

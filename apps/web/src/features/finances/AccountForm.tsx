import {
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_TYPES,
  accountInputSchema,
  formErrors,
  parseAmountToCents,
  type Account,
  type AccountInput,
  type AccountType,
} from '@pf/shared'
import { useState, type FormEvent } from 'react'
import { FormAlert, SubmitButton, TextField } from '../../components/ui/form'
import { amountText } from '../../lib/labels'
import { useMoney } from '../../lib/use-money'
import { describeFailure, type FieldErrors } from '../auth/submit'
import { ACCOUNT_TYPE_LABELS } from './labels'

/**
 * Creates an account or edits one. A card's balance is typed as what is owed and saved as a
 * negative balance, so it subtracts from the net worth.
 */
export function AccountForm({
  account,
  defaults,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  /** The account being edited. */
  account?: Account
  /** Starting values for a new one. */
  defaults?: { name: string; type: AccountType }
  submitLabel: string
  onSubmit: (input: AccountInput) => Promise<void>
  onCancel?: () => void
}) {
  const { symbol, locale } = useMoney()
  const startType = account?.type ?? defaults?.type ?? 'cash'
  const startBalance = account?.initialBalanceCents ?? 0
  const [name, setName] = useState(account?.name ?? defaults?.name ?? '')
  const [type, setType] = useState<AccountType>(startType)
  const [balance, setBalance] = useState(
    startBalance === 0
      ? ''
      : amountText(startType === 'card' ? -startBalance : startBalance, locale),
  )
  const [includeInNetWorth, setIncludeInNetWorth] = useState(account?.includeInNetWorth ?? true)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isCard = type === 'card'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const typed = balance.trim() === '' ? 0 : parseAmountToCents(balance)
    if (typed === null) {
      setErrors({ initialBalanceCents: ['Escribe un monto, por ejemplo 150 o 150,50.'] })
      return
    }
    const input: AccountInput = {
      name: name.trim(),
      type,
      initialBalanceCents: isCard ? -typed : typed,
      includeInNetWorth,
    }
    const invalid = formErrors(accountInputSchema, input)
    setErrors(invalid ?? {})
    setError(null)
    if (invalid) return
    setBusy(true)
    try {
      await onSubmit(input)
    } catch (err) {
      const failure = describeFailure(err)
      setErrors(failure.fields)
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <TextField
        label="Nombre"
        name="name"
        value={name}
        maxLength={ACCOUNT_NAME_MAX_LENGTH}
        autoComplete="off"
        placeholder="Efectivo, Pichincha, Visa…"
        onChange={(e) => setName(e.target.value)}
        errors={errors.name}
      />
      <label className="flex flex-col gap-1 text-sm">
        Tipo
        <select
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          className="rounded border border-input bg-card px-3 py-2 text-base"
        >
          {ACCOUNT_TYPES.map((value) => (
            <option key={value} value={value}>
              {ACCOUNT_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <TextField
        label={
          isCard
            ? `Lo que debes en la tarjeta (${symbol})`
            : `Saldo ${account ? 'inicial' : 'de hoy'} (${symbol})`
        }
        name="initialBalanceCents"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        errors={errors.initialBalanceCents}
      />
      {account && (
        <p className="-mt-2 text-sm text-muted-foreground">
          El saldo de hoy es este más los movimientos de la cuenta.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeInNetWorth}
          onChange={(e) => setIncludeInNetWorth(e.target.checked)}
          className="size-4"
        />
        Cuenta en tu patrimonio neto
      </label>
      {error && <FormAlert>{error}</FormAlert>}
      <div className="flex flex-wrap gap-2">
        <SubmitButton busy={busy} busyLabel="Guardando…">
          {submitLabel}
        </SubmitButton>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border px-4 py-2 hover:bg-muted"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

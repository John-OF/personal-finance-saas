import { useToast } from '../../components/ui/toast-context'
import { AccountForm } from './AccountForm'
import { financeApi } from './api'

/** Nothing can be recorded without an account: the first visit creates one. */
export function FirstAccount({ onCreated }: { onCreated: () => void }) {
  const toast = useToast()
  return (
    <section className="flex flex-col gap-4 rounded border border-border bg-card p-5">
      <h2 className="text-2xl">Tu libreta está en blanco</h2>
      <p className="text-sm text-muted-foreground">
        Empieza por dónde tienes el dinero: el efectivo de tu billetera, una cuenta del banco o una
        tarjeta. Pon lo que tiene hoy; después podrás añadir más cuentas.
      </p>
      <AccountForm
        defaults={{ name: 'Efectivo', type: 'cash' }}
        submitLabel="Crear cuenta"
        onSubmit={async (input) => {
          await financeApi.createAccount(input)
          toast(`Cuenta creada: ${input.name}`)
          onCreated()
        }}
      />
    </section>
  )
}

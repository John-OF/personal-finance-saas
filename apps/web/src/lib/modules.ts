import { MODULE_IDS, type ModuleId } from '@pf/shared'

const MODULE_TEXTS: Record<ModuleId, { label: string; description: string }> = {
  finances: {
    label: 'Cuentas y movimientos',
    description:
      'Tus cuentas, gastos e ingresos del día a día, lo programado y el resumen del mes.',
  },
  commission: {
    label: 'Ingresos por comisión',
    description: 'Anota lo que haces cada día y calcula cuánto te toca el día de pago.',
  },
  debts: {
    label: 'Deudas y préstamos',
    description: 'Lo que debes, lo que te deben y cuándo terminas de pagar.',
  },
  savings: {
    label: 'Ahorro y metas',
    description: 'Fondo de emergencia, cuentas de ahorro y metas con sus aportes.',
  },
  budgets: {
    label: 'Presupuestos',
    description: 'Un tope por categoría cada mes, con aviso al 80 % y al 100 %.',
  },
  planning: {
    label: 'Planificación y reportes',
    description: 'Flujo de caja de los próximos meses, proyección a futuro y gráficos.',
  },
}

export const MODULES = MODULE_IDS.map((id) => ({ id, ...MODULE_TEXTS[id] }))

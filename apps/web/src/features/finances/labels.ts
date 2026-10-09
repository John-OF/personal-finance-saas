import type {
  Account,
  AccountType,
  Category,
  CategoryKind,
  Transaction,
  TransactionKind,
} from '@pf/shared'
import {
  Banknote,
  CreditCard,
  Landmark,
  PiggyBank,
  Smartphone,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Efectivo',
  bank: 'Banco',
  card: 'Tarjeta de crédito',
  wallet: 'Billetera digital',
  savings: 'Ahorro',
  other: 'Otra',
}

/** Until accounts get icons of their own (plan §11), the type gives one. */
export const ACCOUNT_TYPE_ICONS: Record<AccountType, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  card: CreditCard,
  wallet: Smartphone,
  savings: PiggyBank,
  other: Wallet,
}

/** The quick entry's switch, in the prototype's words. */
export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: 'Salió',
  income: 'Entró',
  transfer: 'Entre cuentas',
}

export const KIND_NOUNS: Record<TransactionKind, string> = {
  expense: 'gasto',
  income: 'ingreso',
  transfer: 'transferencia',
}

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  expense: 'Gastos',
  income: 'Ingresos',
}

/** What the row is about: its category, or where the money moved. */
export function transactionTitle(
  transaction: Transaction,
  accounts: Map<string, Account>,
  categories: Map<string, Category>,
) {
  if (transaction.kind === 'transfer') {
    const from = accounts.get(transaction.accountId)?.name ?? '?'
    const to = accounts.get(transaction.toAccountId ?? '')?.name ?? '?'
    return `${from} → ${to}`
  }
  return categories.get(transaction.categoryId ?? '')?.name ?? 'Sin categoría'
}

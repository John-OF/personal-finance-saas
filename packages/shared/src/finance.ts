import { FULL_PERCENT_BP } from './money'

/** Accounts, categories and transactions: the financial core (plan §3.2, §3.3, §6.2). */

export const ACCOUNT_TYPES = ['cash', 'bank', 'card', 'wallet', 'savings', 'other'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const CATEGORY_KINDS = ['income', 'expense'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

/**
 * The kinds of transaction so far; debts and loans add theirs in phase 5 (plan §6.2). Lending or
 * borrowing will be neither income nor expense: the money only changes place, like a transfer.
 */
export const TRANSACTION_KINDS = ['income', 'expense', 'transfer'] as const
export type TransactionKind = (typeof TRANSACTION_KINDS)[number]

/** How each kind moves the balance of its account; a transfer also adds to `toAccountId`. */
export const BALANCE_SIGN: Record<TransactionKind, 1 | -1> = {
  income: 1,
  expense: -1,
  transfer: -1,
}

export const ACCOUNT_NAME_MAX_LENGTH = 40
export const CATEGORY_NAME_MAX_LENGTH = 40
export const TRANSACTION_NOTE_MAX_LENGTH = 120

/** What every user starts with: the prototype's expense categories and a few for income. */
export const DEFAULT_CATEGORIES: Record<CategoryKind, readonly string[]> = {
  expense: ['Comida', 'Transporte', 'Vivienda', 'Servicios', 'Salud', 'Educación', 'Ocio', 'Otros'],
  income: ['Sueldo', 'Ventas', 'Comisiones', 'Otros'],
}

interface NetWorthAccount {
  balanceCents: number
  includeInNetWorth: boolean
  archived: boolean
}

/**
 * What the open accounts counted in the net worth hold (plan §3.11). A card in debt has a negative
 * balance, so it subtracts. Archived accounts are left out: archiving means the account is closed.
 */
export function netWorthCents(accounts: readonly NetWorthAccount[]) {
  return accounts
    .filter(({ includeInNetWorth, archived }) => includeInNetWorth && !archived)
    .reduce((sum, { balanceCents }) => sum + balanceCents, 0)
}

/**
 * The share of what came in that was not spent, in basis points (negative when spending more than
 * what came in); null without income, where a rate means nothing.
 */
export function savingsRateBp(incomeCents: number, expenseCents: number) {
  if (incomeCents <= 0) return null
  return Math.round(((incomeCents - expenseCents) * FULL_PERCENT_BP) / incomeCents)
}

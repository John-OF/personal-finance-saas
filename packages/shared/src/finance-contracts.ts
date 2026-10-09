import { z } from 'zod'
import { dateKeySchema, monthKeySchema } from './dates'
import {
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  CATEGORY_NAME_MAX_LENGTH,
  TRANSACTION_KINDS,
  TRANSACTION_NOTE_MAX_LENGTH,
  type AccountType,
  type CategoryKind,
  type TransactionKind,
} from './finance'
import { MAX_AMOUNT_CENTS } from './money'

/** Request and response shapes of /api/v1/accounts, categories, transactions and reports (plan §8). */

const nameSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: 'Ponle un nombre.' })
    .max(max, { error: `Usa como mucho ${max} caracteres.` })

const idSchema = z.uuid({ error: 'Elige una opción de la lista.' })

// Accounts

const accountFields = {
  name: nameSchema(ACCOUNT_NAME_MAX_LENGTH),
  type: z.enum(ACCOUNT_TYPES, { error: 'Elige el tipo de cuenta.' }),
  /** Negative for a card or an account that starts in debt. */
  initialBalanceCents: z
    .int()
    .min(-MAX_AMOUNT_CENTS, { error: 'Ese monto es demasiado grande.' })
    .max(MAX_AMOUNT_CENTS, { error: 'Ese monto es demasiado grande.' }),
  includeInNetWorth: z.boolean(),
}

export const accountInputSchema = z.strictObject({
  ...accountFields,
  includeInNetWorth: accountFields.includeInNetWorth.optional(),
})
export type AccountInput = z.infer<typeof accountInputSchema>

export const accountUpdateSchema = z
  .strictObject({
    name: accountFields.name.optional(),
    type: accountFields.type.optional(),
    initialBalanceCents: accountFields.initialBalanceCents.optional(),
    includeInNetWorth: accountFields.includeInNetWorth.optional(),
    archived: z.boolean().optional(),
  })
  .refine((update) => Object.keys(update).length > 0, { error: 'No hay nada que guardar.' })
export type AccountUpdate = z.infer<typeof accountUpdateSchema>

export interface Account {
  id: string
  name: string
  type: AccountType
  initialBalanceCents: number
  includeInNetWorth: boolean
  archived: boolean
  /** The initial balance plus every transaction of the account. */
  balanceCents: number
}

export interface AccountsResponse {
  /** Open accounts first, then by when they were created. */
  accounts: Account[]
}

// Categories

export const categoryInputSchema = z.strictObject({
  kind: z.enum(CATEGORY_KINDS),
  name: nameSchema(CATEGORY_NAME_MAX_LENGTH),
})
export type CategoryInput = z.infer<typeof categoryInputSchema>

export const categoryUpdateSchema = z
  .strictObject({
    name: categoryInputSchema.shape.name.optional(),
    archived: z.boolean().optional(),
  })
  .refine((update) => Object.keys(update).length > 0, { error: 'No hay nada que guardar.' })
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>

export interface Category {
  id: string
  kind: CategoryKind
  name: string
  archived: boolean
  /** Transactions in the last 90 days: the quick entry offers the most used first. */
  recentUseCount: number
}

export interface CategoriesResponse {
  /** By name. */
  categories: Category[]
}

// Transactions

const transactionAmountSchema = z
  .int()
  .min(1, { error: 'Escribe un monto mayor a cero.' })
  .max(MAX_AMOUNT_CENTS, { error: 'Ese monto es demasiado grande.' })

const noteSchema = z
  .string()
  .trim()
  .max(TRANSACTION_NOTE_MAX_LENGTH, {
    error: `Usa como mucho ${TRANSACTION_NOTE_MAX_LENGTH} caracteres.`,
  })

const commonTransactionFields = {
  date: dateKeySchema,
  amountCents: transactionAmountSchema,
  accountId: idSchema,
  note: noteSchema.optional(),
}

/**
 * A new transaction, or all the fields of an edited one. Income and expenses need a category of
 * their kind; a transfer goes to another account and has no category.
 */
export const transactionInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal(['income', 'expense']),
    ...commonTransactionFields,
    categoryId: z.uuid({ error: 'Elige una categoría.' }),
  }),
  z
    .strictObject({
      kind: z.literal('transfer'),
      ...commonTransactionFields,
      toAccountId: z.uuid({ error: 'Elige a qué cuenta va.' }),
    })
    .refine(({ accountId, toAccountId }) => accountId !== toAccountId, {
      error: 'Elige dos cuentas distintas.',
      path: ['toAccountId'],
    }),
])
export type TransactionInput = z.infer<typeof transactionInputSchema>

export const TRANSACTIONS_PAGE_SIZE = 50
export const TRANSACTION_SEARCH_MAX_LENGTH = 80

/** Filters of the transaction list (plan §3.3); every one is optional. */
export const transactionsQuerySchema = z
  .strictObject({
    from: dateKeySchema.optional(),
    to: dateKeySchema.optional(),
    kind: z.enum(TRANSACTION_KINDS).optional(),
    accountId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    q: z.string().trim().max(TRANSACTION_SEARCH_MAX_LENGTH).optional(),
    /** `nextCursor` of the previous page. */
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    error: 'La fecha final no puede ser anterior a la inicial.',
  })
export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>

export interface Transaction {
  id: string
  kind: TransactionKind
  date: string
  amountCents: number
  accountId: string
  /** Transfers only. */
  toAccountId: string | null
  /** Income and expenses only. */
  categoryId: string | null
  note: string
}

export interface TransactionTotals {
  count: number
  incomeCents: number
  expenseCents: number
}

export interface TransactionsResponse {
  /** Newest date first; within a day, the last recorded first. */
  transactions: Transaction[]
  /** Null on the last page. */
  nextCursor: string | null
  /** For everything the filters match, on the first page only (null on the next ones). */
  totals: TransactionTotals | null
}

// Reports

export const monthSummaryQuerySchema = z.strictObject({ month: monthKeySchema })

export interface MonthSummary {
  month: string
  incomeCents: number
  expenseCents: number
  /** Totals per category, largest first. */
  categories: { categoryId: string; kind: CategoryKind; totalCents: number }[]
  /** Days of the month with income or expenses, in order. */
  days: { date: string; incomeCents: number; expenseCents: number }[]
}

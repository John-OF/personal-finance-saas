import type {
  Account,
  AccountInput,
  AccountsResponse,
  AccountUpdate,
  CategoriesResponse,
  Category,
  CategoryInput,
  CategoryUpdate,
  MonthSummary,
  Transaction,
  TransactionInput,
  TransactionsQuery,
  TransactionsResponse,
} from '@pf/shared'
import { api } from '../../lib/api'

function queryString(query: TransactionsQuery) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/**
 * Typed calls to /api/v1/accounts, categories, transactions and reports
 * (apps/api/src/modules/{accounts,categories,transactions,reports}/routes.ts).
 */
export const financeApi = {
  accounts: () => api<AccountsResponse>('/accounts'),
  createAccount: (input: AccountInput) =>
    api<Account>('/accounts', { method: 'POST', body: input }),
  updateAccount: (accountId: string, update: AccountUpdate) =>
    api<Account>(`/accounts/${accountId}`, { method: 'PATCH', body: update }),
  deleteAccount: (accountId: string) =>
    api<undefined>(`/accounts/${accountId}`, { method: 'DELETE' }),

  categories: () => api<CategoriesResponse>('/categories'),
  createCategory: (input: CategoryInput) =>
    api<Category>('/categories', { method: 'POST', body: input }),
  updateCategory: (categoryId: string, update: CategoryUpdate) =>
    api<Category>(`/categories/${categoryId}`, { method: 'PATCH', body: update }),
  deleteCategory: (categoryId: string) =>
    api<undefined>(`/categories/${categoryId}`, { method: 'DELETE' }),

  transactions: (query: TransactionsQuery) =>
    api<TransactionsResponse>(`/transactions${queryString(query)}`),
  createTransaction: (input: TransactionInput) =>
    api<Transaction>('/transactions', { method: 'POST', body: input }),
  updateTransaction: (transactionId: string, input: TransactionInput) =>
    api<Transaction>(`/transactions/${transactionId}`, { method: 'PUT', body: input }),
  deleteTransaction: (transactionId: string) =>
    api<undefined>(`/transactions/${transactionId}`, { method: 'DELETE' }),
  restoreTransaction: (transactionId: string) =>
    api<Transaction>(`/transactions/${transactionId}/restore`, { method: 'POST' }),

  monthSummary: (month: string) =>
    api<MonthSummary>(`/reports/summary?${new URLSearchParams({ month }).toString()}`),
}

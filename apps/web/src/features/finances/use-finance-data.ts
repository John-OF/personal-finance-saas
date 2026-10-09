import type { Account, Category } from '@pf/shared'
import { useCallback } from 'react'
import { useLoad } from '../../lib/use-load'
import { financeApi } from './api'

export interface FinanceData {
  /** Open accounts first. */
  accounts: Account[]
  /** By name. */
  categories: Category[]
}

/** Accounts (with their balances) and categories, which most finance pages need together. */
export function useFinanceData() {
  const load = useCallback(async (): Promise<FinanceData> => {
    const [{ accounts }, { categories }] = await Promise.all([
      financeApi.accounts(),
      financeApi.categories(),
    ])
    return { accounts, categories }
  }, [])
  return useLoad(load)
}

/** Lookups by id for lists that only carry ids. */
export function byId<T extends { id: string }>(items: readonly T[]) {
  return new Map(items.map((item) => [item.id, item]))
}

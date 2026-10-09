import {
  TRANSACTIONS_PAGE_SIZE,
  type Transaction,
  type TransactionsQuery,
  type TransactionTotals,
} from '@pf/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { describeFailure } from '../auth/submit'
import { financeApi } from './api'

/** The API's largest page: a reload brings back at most this many rows at once. */
const MAX_PAGE = 100

interface Loaded {
  key: string
  transactions: Transaction[]
  nextCursor: string | null
  totals: TransactionTotals | null
  error?: string
}

/**
 * The transactions a set of filters matches, page by page. `reload` (after a change) fetches again
 * as many rows as are shown, so the list does not jump back to the first page; while it loads, the
 * current rows stay on screen.
 */
export function useTransactionList(query: TransactionsQuery) {
  const key = JSON.stringify(query)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const shown = useRef({ key, count: 0 })

  useEffect(() => {
    let current = true
    const filters = JSON.parse(key) as TransactionsQuery
    const count = shown.current.key === key ? shown.current.count : 0
    const limit = Math.min(MAX_PAGE, Math.max(TRANSACTIONS_PAGE_SIZE, count))
    financeApi.transactions({ ...filters, limit }).then(
      (page) => {
        if (!current) return
        shown.current = { key, count: page.transactions.length }
        setLoaded({ key, ...page })
      },
      (err: unknown) => {
        if (!current) return
        setLoaded({
          key,
          transactions: [],
          nextCursor: null,
          totals: null,
          error: describeFailure(err).message,
        })
      },
    )
    return () => {
      current = false
    }
  }, [key, attempt])

  const own = loaded?.key === key ? loaded : undefined
  const nextCursor = own?.nextCursor ?? null

  const loadMore = useCallback(async () => {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const filters = JSON.parse(key) as TransactionsQuery
      const page = await financeApi.transactions({ ...filters, cursor: nextCursor })
      setLoaded((previous) => {
        if (previous?.key !== key) return previous
        const transactions = [...previous.transactions, ...page.transactions]
        shown.current = { key, count: transactions.length }
        return { ...previous, transactions, nextCursor: page.nextCursor }
      })
    } finally {
      setLoadingMore(false)
    }
  }, [key, nextCursor])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return {
    /** Undefined while the first page loads. */
    transactions: own && !own.error ? own.transactions : undefined,
    totals: own?.totals ?? null,
    error: own?.error,
    hasMore: nextCursor !== null,
    loadMore,
    loadingMore,
    reload,
  }
}

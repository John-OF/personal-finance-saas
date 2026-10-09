import { useCallback, useEffect, useState } from 'react'
import { describeFailure } from '../features/auth/submit'

interface Loaded<T> {
  load: () => Promise<T>
  data?: T
  error?: string
}

/**
 * Runs `load` (memoize it with useCallback: a new function means new data) and keeps its result.
 * `reload` fetches again while still showing the current data; a slower, older answer never
 * replaces a newer one.
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    load().then(
      (data) => {
        if (current) setLoaded({ load, data })
      },
      (err: unknown) => {
        if (current) setLoaded({ load, error: describeFailure(err).message })
      },
    )
    return () => {
      current = false
    }
  }, [load, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  // Data of a previous `load` (e.g. another plan) is not shown while the new one arrives.
  const own = loaded?.load === load ? loaded : undefined
  return { data: own?.data, error: own?.error, reload }
}

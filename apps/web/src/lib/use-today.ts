import { todayIn } from '@pf/shared'
import { useEffect, useMemo, useState } from 'react'

/**
 * Today's date in the user's time zone (from their profile, plan §7.2). It is checked again when the
 * page comes back into view and once a minute, so a page left open overnight moves to the new day.
 */
export function useToday(timeZone: string) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const check = () => setTick((n) => n + 1)
    document.addEventListener('visibilitychange', check)
    const timer = setInterval(check, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', check)
      clearInterval(timer)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick only asks to look at the clock again
  return useMemo(() => todayIn(timeZone), [timeZone, tick])
}

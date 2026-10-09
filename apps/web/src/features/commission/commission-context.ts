import type { CommissionPlan, CommissionWeekSummary } from '@pf/shared'
import { createContext, use } from 'react'

export interface CommissionState {
  plans: CommissionPlan[]
  /** The plan being shown. */
  plan: CommissionPlan
  selectPlan: (planId: string) => void
  reloadPlans: () => void
  /** Every week with entries or a payout, newest first; undefined while loading. */
  weeks: CommissionWeekSummary[] | undefined
  reloadWeeks: () => void
  /** Today in the user's time zone. */
  today: string
  /** Payday of the week today belongs to. */
  currentPayday: string
  /** `$25` or `$25,50`, in the user's currency and locale. */
  money: (cents: number) => string
  /** `50 %` */
  percent: (bp: number) => string
  /** "la mitad" or "el 40 %", to use in sentences. */
  shareWords: (bp: number) => string
  /** Currency symbol for amount inputs. */
  symbol: string
}

export const CommissionContext = createContext<CommissionState | null>(null)

/** The commission module's state; only under CommissionLayout. */
export function useCommission() {
  const state = use(CommissionContext)
  if (!state) throw new Error('useCommission must be used inside CommissionLayout')
  return state
}

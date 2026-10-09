import type { CommissionSchedule } from '@pf/shared'

/**
 * The settings speak of a payday and whether the work of that same day is paid on it (as the
 * prototype's two modes); the API stores when weeks end and how many days later they are paid.
 */
export interface ScheduleChoice {
  /** 0 = Sunday … 6 = Saturday. */
  paydayWeekday: number
  /** The work of payday is paid that same day (true) or on the next payday (false). */
  sameDay: boolean
}

export function scheduleOf({ paydayWeekday, sameDay }: ScheduleChoice): CommissionSchedule {
  return sameDay
    ? { periodEndWeekday: paydayWeekday, paydayOffsetDays: 0 }
    : { periodEndWeekday: (paydayWeekday + 6) % 7, paydayOffsetDays: 1 }
}

export function choiceOf({
  periodEndWeekday,
  paydayOffsetDays,
}: CommissionSchedule): ScheduleChoice {
  return {
    paydayWeekday: (periodEndWeekday + paydayOffsetDays) % 7,
    sameDay: paydayOffsetDays === 0,
  }
}

/** The prototype's default: Sunday to Saturday, paid on Saturday. */
export const DEFAULT_SCHEDULE_CHOICE: ScheduleChoice = { paydayWeekday: 6, sameDay: true }

import { capitalize, weekdayName } from '../../lib/labels'
import type { ScheduleChoice } from './schedule'

const selectClass = 'rounded border border-input bg-card px-3 py-2 text-base'
// Monday first, as weeks are read in Spanish; values are 0 = Sunday … 6 = Saturday.
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]

/** Payday and whether the work of that day is paid on it, as the prototype's two modes. */
export function ScheduleFields({
  value,
  onChange,
}: {
  value: ScheduleChoice
  onChange: (value: ScheduleChoice) => void
}) {
  const payday = weekdayName(value.paydayWeekday)
  const after = weekdayName((value.paydayWeekday + 1) % 7)
  const before = weekdayName((value.paydayWeekday + 6) % 7)
  const options = [
    {
      sameDay: true,
      title: `De ${after} a ${payday}`,
      detail: `Lo que haces el ${payday} se cobra ese mismo día.`,
    },
    {
      sameDay: false,
      title: `De ${payday} a ${before}`,
      detail: `Lo que haces el ${payday} se cobra el ${payday} siguiente.`,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Día de pago
        <select
          value={value.paydayWeekday}
          onChange={(e) => onChange({ ...value, paydayWeekday: Number(e.target.value) })}
          className={selectClass}
        >
          {WEEKDAYS.map((weekday) => (
            <option key={weekday} value={weekday}>
              {capitalize(weekdayName(weekday))}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm">Semana de pago</legend>
        {options.map((option) => (
          <label
            key={String(option.sameDay)}
            className="flex cursor-pointer gap-3 rounded border border-border p-3 has-checked:border-primary"
          >
            <input
              type="radio"
              name="sameDay"
              checked={value.sameDay === option.sameDay}
              onChange={() => onChange({ ...value, sameDay: option.sameDay })}
              className="mt-1 accent-primary"
            />
            <span className="flex flex-col">
              <span className="font-medium">{option.title}</span>
              <span className="text-sm text-muted-foreground">{option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}

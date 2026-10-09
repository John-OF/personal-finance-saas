import {
  addDays,
  commissionEntryInputSchema,
  commissionWeekByPayday,
  commissionWeekOf,
  emptyWeekSummary,
  formErrors,
  isDateKey,
  isPayday,
  parseAmountToCents,
  weekDates,
  type CommissionEntry,
} from '@pf/shared'
import { X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMe } from '../../app/me-context'
import { useToast } from '../../components/ui/toast-context'
import { useLoad } from '../../lib/use-load'
import { describeFailure } from '../auth/submit'
import { commissionApi } from './api'
import { useCommission } from './commission-context'
import { DayList } from './DayList'
import { EntryForm, type EntryDraft } from './EntryForm'
import { Envelope } from './Envelope'
import { amountText, dayLabel } from '../../lib/labels'
import { PayoutBox } from './PayoutBox'

const DISMISSED_KEY = 'libreta:commission:dismissed:'

/** Paydays whose "¿Ya te pagaron?" notice was closed, per plan (a preference of this browser). */
function readDismissed(planId: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY + planId) ?? '[]')
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

function scrollIntoView(id: string, block: ScrollLogicalPosition = 'nearest') {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block })
}

/** The "Semana" tab: one pay week, its entries and its payout (plan §2.2). */
export function WeekView() {
  const { plan, weeks, reloadWeeks, today, currentPayday, money } = useCommission()
  const { locale } = useMe().me.profile
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const requested = params.get('semana')
  const payday =
    requested && isDateKey(requested) && isPayday(requested, plan) ? requested : currentPayday
  const isCurrent = payday === currentPayday
  const goWeek = (target: string) => {
    setExpanded(null)
    setParams(target === currentPayday ? {} : { semana: target })
  }

  const week = useMemo(() => commissionWeekByPayday(payday, plan), [payday, plan])
  const loadEntries = useCallback(
    () => commissionApi.entries(plan.id, { from: week.start, to: week.end }),
    [plan.id, week.start, week.end],
  )
  const entries = useLoad(loadEntries)
  const refresh = () => {
    reloadWeeks()
    entries.reload()
  }

  const summary =
    weeks?.find((item) => item.payday === payday) ?? emptyWeekSummary(payday, plan, plan.rates)
  const dates = weekDates(week)
  const entriesByDate = useMemo(() => {
    const byDate = new Map<string, CommissionEntry[]>()
    for (const entry of entries.data?.entries ?? []) {
      byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry])
    }
    return byDate
  }, [entries.data])
  const days = dates.map((date) => ({
    date,
    totalCents: (entriesByDate.get(date) ?? []).reduce((sum, e) => sum + e.amountCents, 0),
  }))

  const [expanded, setExpanded] = useState<string | null>(null)
  const emptyDraft = (): EntryDraft => ({ editingId: null, date: today, amount: '', note: '' })
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  function focusForm() {
    amountRef.current?.focus({ preventScroll: true })
    scrollIntoView('entry-form', 'center')
  }

  async function saveEntry() {
    const amountCents = parseAmountToCents(draft.amount)
    const input = { date: draft.date, amountCents: amountCents ?? 0, note: draft.note.trim() }
    const invalid = formErrors(commissionEntryInputSchema, input)
    if (amountCents === null || amountCents <= 0) {
      setFormError('Escribe cuánto hiciste, por ejemplo 25.')
      amountRef.current?.focus()
      return
    }
    if (invalid) {
      setFormError(Object.values(invalid).flat()[0] ?? 'Revisa los datos.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (draft.editingId) await commissionApi.updateEntry(draft.editingId, input)
      else await commissionApi.addEntry(plan.id, input)
      toast(
        draft.editingId
          ? 'Cambios guardados'
          : `Guardado: ${money(amountCents)} el ${dayLabel(input.date)}`,
      )
      setDraft(emptyDraft())
      ;(document.activeElement as HTMLElement | null)?.blur()
      const target = commissionWeekOf(input.date, plan).payday
      if (target !== payday) goWeek(target)
      refresh()
    } catch (err) {
      setFormError(describeFailure(err).message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry(entry: CommissionEntry) {
    if (draft.editingId === entry.id) setDraft(emptyDraft())
    try {
      await commissionApi.deleteEntry(entry.id)
      refresh()
      toast(`Borrado: ${money(entry.amountCents)} del ${dayLabel(entry.date)}`, {
        action: {
          label: 'Deshacer',
          run: () => {
            commissionApi.restoreEntry(entry.id).then(refresh, () => toast('No se pudo deshacer.'))
          },
        },
      })
    } catch (err) {
      toast(describeFailure(err).message)
    }
  }

  async function confirmPayout(target: string, paidCents: number) {
    try {
      await commissionApi.confirmPayout(plan.id, target, paidCents)
      reloadWeeks()
      toast(`Marcado como cobrado: ${money(paidCents)}`)
      return true
    } catch (err) {
      toast(describeFailure(err).message)
      return false
    }
  }

  async function undoPayout() {
    const previous = summary.payout
    if (!previous) return
    try {
      await commissionApi.undoPayout(plan.id, payday)
      reloadWeeks()
      toast('Ya no está marcado como cobrado', {
        action: {
          label: 'Deshacer',
          run: () => void confirmPayout(previous.payday, previous.paidCents),
        },
      })
    } catch (err) {
      toast(describeFailure(err).message)
    }
  }

  // Last week's payment, if it was due and nobody marked it (only on the current week).
  const [dismissed, setDismissed] = useState(() => readDismissed(plan.id))
  const previousPayday = addDays(currentPayday, -7)
  const previous = weeks?.find((item) => item.payday === previousPayday)
  const showNotice =
    isCurrent &&
    previous !== undefined &&
    previous.grossCents > 0 &&
    !previous.payout &&
    !dismissed.includes(previousPayday)

  function dismissNotice() {
    const next = [...dismissed, previousPayday].slice(-30)
    setDismissed(next)
    try {
      localStorage.setItem(DISMISSED_KEY + plan.id, JSON.stringify(next))
    } catch {
      // Without storage the notice comes back on the next visit.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Envelope
        week={summary}
        days={days}
        isCurrent={isCurrent}
        canGoNext={payday < currentPayday}
        onPrevious={() => goWeek(addDays(payday, -7))}
        onNext={() => goWeek(addDays(payday, 7))}
        onCurrent={() => goWeek(currentPayday)}
        loading={!weeks}
        onOpenDay={(date) => {
          setExpanded(date)
          requestAnimationFrame(() => scrollIntoView(`day-${date}`, 'center'))
        }}
      />

      <EntryForm
        draft={draft}
        onChange={(next) => {
          setDraft(next)
          setFormError(null)
        }}
        busy={saving}
        error={formError}
        onSubmit={() => void saveEntry()}
        onCancel={() => {
          setDraft(emptyDraft())
          setFormError(null)
        }}
        amountRef={amountRef}
      />

      {showNotice && previous && (
        <div className="flex items-start gap-1.5 rounded-xl border border-l-4 border-border border-l-envelope-accent bg-card py-3 pr-1.5 pl-3.5">
          <div className="min-w-0 flex-1">
            <p>
              {previousPayday === today
                ? `Hoy te pagan ${money(previous.expectedCents)} de la semana pasada.`
                : `El ${dayLabel(previousPayday)} te tocaban ${money(previous.expectedCents)}. ¿Ya te pagaron?`}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => void confirmPayout(previousPayday, previous.expectedCents)}
                className="h-10 rounded-lg border border-border px-3.5 text-sm font-bold hover:bg-muted"
              >
                Sí, ya cobré
              </button>
              <button
                type="button"
                onClick={() => goWeek(previousPayday)}
                className="h-9 rounded-lg px-2 text-sm font-semibold text-link hover:bg-muted"
              >
                Ver esa semana
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Ocultar aviso"
            className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X aria-hidden className="size-[18px]" />
          </button>
        </div>
      )}

      <h3 className="mt-3 text-lg font-bold">Día por día</h3>
      {entries.error ? (
        <p role="alert" className="text-destructive">
          {entries.error}
        </p>
      ) : (
        <DayList
          dates={dates}
          entriesByDate={entriesByDate}
          payday={payday}
          expanded={expanded}
          onToggle={(date) => setExpanded((open) => (open === date ? null : date))}
          onEdit={(entry) => {
            setDraft({
              editingId: entry.id,
              date: entry.date,
              amount: amountText(entry.amountCents, locale),
              note: entry.note,
            })
            setFormError(null)
            focusForm()
          }}
          onDelete={(entry) => void deleteEntry(entry)}
          onAddTo={(date) => {
            setDraft({ ...emptyDraft(), date })
            setFormError(null)
            focusForm()
          }}
        />
      )}

      {weeks && (
        <PayoutBox
          key={payday}
          week={summary}
          onConfirm={(paidCents) => confirmPayout(payday, paidCents)}
          onUndo={() => void undoPayout()}
        />
      )}
    </div>
  )
}

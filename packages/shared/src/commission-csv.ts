import {
  commissionWeekOf,
  rateOn,
  type CommissionRate,
  type CommissionSchedule,
} from './commission'
import { isDateKey, weekdayOf } from './dates'
import { applyPercentBp, MAX_AMOUNT_CENTS, parseAmountToCents } from './money'

/**
 * The CSV of the prototype (docs/mis-ingresos.html): what it exports is read back exactly, so its data
 * can be moved into the app, and the app exports the same columns.
 */

export const COMMISSION_NOTE_MAX_LENGTH = 80

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const HEADER = ['Fecha', 'Día', 'Monto', 'Nota', 'Día de pago', 'Porcentaje', 'Tu parte']

export interface CommissionCsvRow {
  date: string
  amountCents: number
  note: string
}

export type ParsedCommissionCsv =
  | { ok: true; rows: CommissionCsvRow[]; invalidRows: number }
  | { ok: false; error: 'missing_columns' }

/** Splits CSV text, with `,` or `;` (as Excel saves it in Spanish) as the separator. */
function splitCsv(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (char: string) => firstLine.split(char).length - 1
  const delimiter = count(';') > count(',') ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char !== '"') cell += char
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (char === '"') quoted = true
    else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const normalizeHeader = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** `2026-10-05`, or day first as in `05/10/2026`, `5-10-26` or `5.10.2026`. */
function parseDateCell(raw: string) {
  const value = raw.trim()
  const pad = (n: string) => n.padStart(2, '0')
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value)
  let date: string | null = null
  if (match) date = `${match[1]}-${pad(match[2] ?? '')}-${pad(match[3] ?? '')}`
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(value))) {
    const year = match[3] ?? ''
    date = `${year.length === 2 ? `20${year}` : year}-${pad(match[2] ?? '')}-${pad(match[1] ?? '')}`
  }
  return date && isDateKey(date) ? date : null
}

/** Characters that make a spreadsheet read a cell as a formula (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/

/** Notes are exported with a `'` before a formula character; the quote is removed on the way back. */
function cleanNote(raw: string) {
  return raw
    .replace(/^'(?=[=+\-@\t\r])/, '')
    .trim()
    .slice(0, COMMISSION_NOTE_MAX_LENGTH)
}

/** Reads the rows; those without a valid date or a positive amount are counted, not returned. */
export function parseCommissionCsv(text: string): ParsedCommissionCsv {
  const [header = [], ...body] = splitCsv(text.replace(/^\ufeff/, ''))
  const columns = header.map(normalizeHeader)
  const dateColumn = columns.indexOf('fecha')
  const amountColumn = columns.indexOf('monto')
  const noteColumn = columns.indexOf('nota')
  if (dateColumn < 0 || amountColumn < 0) return { ok: false, error: 'missing_columns' }

  const rows: CommissionCsvRow[] = []
  let invalidRows = 0
  for (const cells of body) {
    const date = parseDateCell(cells[dateColumn] ?? '')
    const amountCents = parseAmountToCents(cells[amountColumn] ?? '')
    if (!date || amountCents === null || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
      invalidRows++
      continue
    }
    rows.push({
      date,
      amountCents,
      note: noteColumn >= 0 ? cleanNote(cells[noteColumn] ?? '') : '',
    })
  }
  return { ok: true, rows, invalidRows }
}

function csvCell(value: string) {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** `2500` → `25.00`, without going through floating point. */
function centsText(cents: number) {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

/** `5000` → `50`, `3750` → `37.5`. */
function percentText(percentBp: number) {
  return String(percentBp / 100)
}

/**
 * The prototype's CSV for `entries` (already in the order to export them), with a BOM so Excel
 * reads the accents. The percentage and share of each row are those of its week's payday.
 */
export function commissionCsv(
  entries: readonly CommissionCsvRow[],
  schedule: CommissionSchedule,
  rates: readonly CommissionRate[],
) {
  const rows = [HEADER]
  for (const { date, amountCents, note } of entries) {
    const payday = commissionWeekOf(date, schedule).payday
    const percentBp = rateOn(rates, payday)
    rows.push([
      date,
      DAY_NAMES[weekdayOf(date)] ?? '',
      centsText(amountCents),
      note,
      payday,
      percentText(percentBp),
      centsText(applyPercentBp(amountCents, percentBp)),
    ])
  }
  return `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
}

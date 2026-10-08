import { describe, expect, it } from 'vitest'
import { COMMISSION_SCHEDULES } from './commission'
import { commissionCsv, parseCommissionCsv } from './commission-csv'

const schedule = COMMISSION_SCHEDULES.sundayToSaturday
const rates = [{ percentBp: 5000, effectiveFrom: '2026-01-01' }]

describe('parseCommissionCsv', () => {
  it("reads the prototype's export as it is", () => {
    const csv =
      '\ufeffFecha,Día,Monto,Nota,Día de pago,Porcentaje,Tu parte\r\n' +
      '2026-10-05,Lunes,25.00,,2026-10-10,50,12.50\r\n' +
      '2026-10-06,Martes,30.50,"propina, ""extra""",2026-10-10,50,15.25\r\n' +
      "2026-10-07,Miércoles,10.00,'=1+1,2026-10-10,50,5.00"
    expect(parseCommissionCsv(csv)).toEqual({
      ok: true,
      rows: [
        { date: '2026-10-05', amountCents: 2500, note: '' },
        { date: '2026-10-06', amountCents: 3050, note: 'propina, "extra"' },
        { date: '2026-10-07', amountCents: 1000, note: '=1+1' },
      ],
      invalidRows: 0,
    })
  })

  it('reads what Excel saves in Spanish: semicolons, day-first dates and decimal commas', () => {
    const csv = 'FECHA;Monto ;Nota\n05/10/2026;25,50;hola\n6/10/26;1.500,00;\n'
    expect(parseCommissionCsv(csv)).toEqual({
      ok: true,
      rows: [
        { date: '2026-10-05', amountCents: 2550, note: 'hola' },
        { date: '2026-10-06', amountCents: 150000, note: '' },
      ],
      invalidRows: 0,
    })
  })

  it('counts the rows it cannot use instead of guessing', () => {
    const csv =
      'Fecha,Monto\n31/02/2026,10\n2026-10-05,0\n2026-10-05,-5\n2026-10-05,\nayer,10\n2026-10-05,7'
    expect(parseCommissionCsv(csv)).toEqual({
      ok: true,
      rows: [{ date: '2026-10-05', amountCents: 700, note: '' }],
      invalidRows: 5,
    })
  })

  it('needs the Fecha and Monto columns', () => {
    expect(parseCommissionCsv('Date,Amount\n2026-10-05,10')).toEqual({
      ok: false,
      error: 'missing_columns',
    })
    expect(parseCommissionCsv('')).toEqual({ ok: false, error: 'missing_columns' })
  })

  it('cuts notes to 80 characters', () => {
    const parsed = parseCommissionCsv(`Fecha,Monto,Nota\n2026-10-05,1,${'x'.repeat(100)}`)
    expect(parsed.ok && parsed.rows[0]?.note).toHaveLength(80)
  })
})

describe('commissionCsv', () => {
  it("writes the prototype's columns, with the share of each row's payday", () => {
    const csv = commissionCsv(
      [
        { date: '2026-10-05', amountCents: 2525, note: '' },
        { date: '2026-10-12', amountCents: 1000, note: 'turno extra' },
      ],
      schedule,
      [...rates, { percentBp: 6000, effectiveFrom: '2026-10-17' }],
    )
    expect(csv).toBe(
      '\ufeffFecha,Día,Monto,Nota,Día de pago,Porcentaje,Tu parte\r\n' +
        '2026-10-05,Lunes,25.25,,2026-10-10,50,12.63\r\n' +
        '2026-10-12,Lunes,10.00,turno extra,2026-10-17,60,6.00',
    )
  })

  it('keeps spreadsheets from running notes as formulas', () => {
    const csv = commissionCsv(
      [{ date: '2026-10-05', amountCents: 100, note: '=HYPERLINK("http://x")' }],
      schedule,
      rates,
    )
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
  })

  it('round-trips through parseCommissionCsv', () => {
    const entries = [
      { date: '2026-10-05', amountCents: 2500, note: 'He said "hi", ok' },
      { date: '2026-10-06', amountCents: 99_999_999_999, note: '-5 descuento' },
      { date: '2026-10-07', amountCents: 1, note: '@mención' },
    ]
    expect(parseCommissionCsv(commissionCsv(entries, schedule, rates))).toEqual({
      ok: true,
      rows: entries,
      invalidRows: 0,
    })
  })
})

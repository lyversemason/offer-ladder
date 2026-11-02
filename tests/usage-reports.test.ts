// The Usage tab's reports (v0.16.0), checked two ways: they add up against the
// raw tables, and they show the tool habits planted in src/data/habits.ts.
import { describe, expect, it } from 'vitest'
import { runReport } from '../src/db/database'
import { REPS } from '../src/data/org'
import { demoDatabase } from './sqljs'

type Row = Record<string, unknown>

async function report(id: string): Promise<Row[]> {
  const { db } = await demoDatabase()
  const res = runReport(db, id)
  return res.rows.map((row) => Object.fromEntries(res.columns.map((c, i) => [c, row[i]])))
}
async function one(sql: string) {
  const { db } = await demoDatabase()
  return db.exec(sql)[0]?.values[0]?.[0]
}
const sum = (rows: Row[], col: string) => rows.reduce((s, r) => s + Number(r[col] ?? 0), 0)
const repName = (id: string) => REPS.find((r) => r.id === id)!.name
/** The rep with the highest (or lowest) value in a column. */
const top = (rows: Row[], col: string) => [...rows].sort((a, b) => Number(b[col]) - Number(a[col]))[0].rep
const bottom = (rows: Row[], col: string) => [...rows].sort((a, b) => Number(a[col]) - Number(b[col]))[0].rep

describe('usage reports add up', () => {
  it('company by month: customers and tickets match the raw tables', async () => {
    const rows = await report('usage-company-by-month')
    expect(rows).toHaveLength(6)
    expect(sum(rows, 'customers')).toBe(await one('SELECT SUM(ups) FROM traffic'))
    expect(sum(rows, 'tickets')).toBe(await one("SELECT COUNT(*) FROM events WHERE type = 'ticket_started'"))
    for (const r of rows) {
      expect(r.reps_using).toBeLessThanOrEqual(r.reps_on_floor as number)
      expect(Number(r.outcome_pct) + Number(r.dropped_pct)).toBeCloseTo(100, 0)
    }
  })

  it('stores by week: the weeks add up to the same customers and tickets', async () => {
    const rows = await report('usage-stores-by-week')
    expect(sum(rows, 'customers')).toBe(await one('SELECT SUM(ups) FROM traffic'))
    expect(sum(rows, 'tickets')).toBe(await one("SELECT COUNT(*) FROM events WHERE type = 'ticket_started'"))
    expect(sum(rows, 'sittings')).toBe(await one("SELECT COUNT(*) FROM events WHERE type = 'session_started'"))
    for (const r of rows) expect(new Date(`${r.week}T12:00:00`).getDay()).toBe(1) // every week starts on a Monday
  })

  it('coverage: one row per rep per month, tickets + no ticket = customers', async () => {
    const rows = await report('usage-coverage')
    expect(rows).toHaveLength(7 * 6)
    for (const r of rows) expect(Number(r.tickets) + Number(r.no_ticket)).toBe(r.customers)
  })

  it('ticket funnel: every ticket ends bought, walked or dropped', async () => {
    const rows = await report('usage-funnel')
    expect(rows).toHaveLength(7)
    for (const r of rows) expect(Number(r.bought) + Number(r.walked) + Number(r.dropped)).toBe(r.tickets)
    expect(sum(rows, 'bought')).toBe(await one('SELECT COUNT(*) FROM deals'))
    expect(sum(rows, 'bought') + sum(rows, 'walked')).toBe(await one('SELECT COUNT(*) FROM visits'))
  })

  it('adding items: the four ways add up to 100% in every row', async () => {
    const rows = await report('usage-adding-items')
    expect(sum(rows, 'items')).toBe(await one("SELECT COUNT(*) FROM events WHERE type = 'item_added'"))
    for (const r of rows) expect(sum([r], 'sku_pct') + sum([r], 'search_pct') + sum([r], 'lookup_pct') + sum([r], 'inventory_pct')).toBeCloseTo(100, 0)
  })

  it('price changes: how and where each add up to 100%', async () => {
    const rows = await report('usage-price-changes')
    expect(sum(rows, 'price_changes')).toBe(await one("SELECT COUNT(*) FROM events WHERE type = 'discount_applied'"))
    for (const r of rows) {
      expect(Number(r.new_price_pct) + Number(r.percent_pct) + Number(r.dollars_pct)).toBeCloseTo(100, 0)
      expect(Number(r.one_row_pct) + Number(r.whole_ticket_pct) + Number(r.delivery_pct)).toBeCloseTo(100, 0)
    }
  })

  it('data quality: recorded + dropped + no ticket = customers', async () => {
    for (const r of await report('usage-data-quality')) {
      expect(Number(r.recorded) + Number(r.dropped) + Number(r.no_ticket)).toBe(r.customers)
    }
  })
})

describe('usage reports show the planted habits', () => {
  it('coverage: Tasha highest, Ben lowest; Sofia climbs from April to September', async () => {
    const quality = await report('usage-data-quality')
    const byRep = await report('usage-coverage')
    const whole = REPS.map((rep) => {
      const rows = byRep.filter((r) => r.rep === rep.name)
      return { rep: rep.name, coverage: sum(rows, 'tickets') / sum(rows, 'customers') }
    })
    expect(top(whole, 'coverage')).toBe(repName('tasha'))
    expect(bottom(whole, 'coverage')).toBe(repName('ben'))
    const sofia = byRep.filter((r) => r.rep === repName('sofia'))
    expect(Number(sofia.at(-1)!.coverage_pct)).toBeGreaterThan(Number(sofia[0].coverage_pct) + 15)
    expect(top(quality, 'seen_pct')).toBe(repName('tasha'))
  })

  it('adding items: Sofia moves from Look up and Inventory to typed SKUs', async () => {
    const sofia = (await report('usage-adding-items')).filter((r) => r.rep === repName('sofia'))
    const helped = (r: Row) => Number(r.lookup_pct) + Number(r.inventory_pct)
    expect(helped(sofia[0])).toBeGreaterThan(helped(sofia.at(-1)!) + 20)
    expect(Number(sofia.at(-1)!.sku_pct)).toBeGreaterThan(Number(sofia[0].sku_pct) + 20)
  })

  it('price changes: Kevin types % off most and has the most refused prices', async () => {
    const rows = await report('usage-price-changes')
    expect(top(rows, 'percent_pct')).toBe(repName('kevin'))
    expect(top(rows, 'refused_per_100')).toBe(repName('kevin'))
  })

  it('scratchpad: Ben tries the most prices per offer; Renee is quickest to a first price', async () => {
    const rows = await report('usage-scratchpad')
    expect(top(rows, 'changes_per_ticket')).toBe(repName('ben'))
    expect(top(rows, 'changes_per_offer')).toBe(repName('ben'))
    expect(bottom(rows, 'offers_per_ticket')).toBe(repName('ben'))
    expect(bottom(rows, 'minutes_to_first_price')).toBe(repName('renee'))
  })

  it('data quality: Kevin records the smallest share of his walk-outs', async () => {
    const rows = await report('usage-data-quality')
    expect(bottom(rows, 'walkouts_recorded_pct')).toBe(repName('kevin'))
    expect(top(await report('usage-funnel'), 'dropped')).toBe(repName('kevin'))
  })
})

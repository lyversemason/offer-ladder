// The Deal patterns tab's reports (v0.18.0) and the offer_facts view they read:
// they add up against the raw tables, and they find the customer patterns planted
// in src/data/habits.ts.
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
const find = (rows: Row[], col: string, value: string) => rows.find((r) => r[col] === value)!

describe('the offer_facts view', () => {
  it('has one row per offer, and the asking price is never a discount', async () => {
    expect(await one('SELECT COUNT(*) FROM offer_facts')).toBe(await one('SELECT COUNT(*) FROM offers'))
    expect(await one('SELECT COUNT(*) FROM offer_facts WHERE step_no = 0 AND discount_pct <> 0')).toBe(0)
  })

  it('marks delivery the same way the offers record it', async () => {
    expect(await one("SELECT COUNT(*) FROM offer_facts WHERE delivery = 'waived'")).toBe(
      await one('SELECT COUNT(*) FROM offers WHERE delivery_list_cents > 0 AND delivery_price_cents = 0'),
    )
    expect(await one("SELECT COUNT(*) FROM offer_facts WHERE delivery = 'pickup'")).toBe(await one('SELECT COUNT(*) FROM offers WHERE delivery_tier_id IS NULL'))
  })
})

describe('deal pattern reports add up', () => {
  it('discount size: every offer after the asking price is counted once', async () => {
    const rows = await report('patterns-discount-size')
    expect(sum(rows, 'offers')).toBe(await one('SELECT COUNT(*) FROM offers WHERE step_no > 0'))
    expect(sum(rows, 'accepted')).toBe(await one('SELECT COUNT(*) FROM offers WHERE step_no > 0 AND accepted = 1'))
  })

  it('base discount: only offers with a discountable base', async () => {
    const rows = await report('patterns-base-discount')
    expect(sum(rows, 'offers')).toBe(
      await one(`SELECT COUNT(DISTINCT o.id) FROM offers o JOIN offer_lines l ON l.offer_id = o.id JOIN products p ON p.sku = l.sku
                 WHERE o.step_no > 0 AND p.category = 'adjustable-base' AND l.locked = 0`),
    )
  })

  it('delivery: every offer after the asking price, in one ticket-size and delivery group', async () => {
    expect(sum(await report('patterns-free-delivery'), 'offers')).toBe(await one('SELECT COUNT(*) FROM offers WHERE step_no > 0'))
  })

  it('financing: every recorded customer once; buyers match the sales', async () => {
    const rows = await report('patterns-financing')
    expect(sum(rows, 'customers')).toBe(await one('SELECT COUNT(*) FROM visits'))
    expect(sum(rows, 'bought')).toBe(await one('SELECT COUNT(*) FROM deals'))
  })

  it('second offers: only customers who said no to offer 1 and heard another', async () => {
    const rows = await report('patterns-second-offers')
    expect(sum(rows, 'customers')).toBe(
      await one(`SELECT COUNT(*) FROM offers f WHERE f.step_no = 1 AND f.accepted = 0
                 AND EXISTS (SELECT 1 FROM offers l WHERE l.visit_id = f.visit_id AND l.step_no > 1)`),
    )
  })

  it('commission given up = commission at the asking price − commission paid, for every sale', async () => {
    const rows = await report('patterns-commission-given-up')
    expect(rows).toHaveLength(REPS.length)
    expect(sum(rows, 'sales')).toBe(await one('SELECT COUNT(*) FROM deals'))
    expect(sum(rows, 'commission')).toBeCloseTo(Number(await one('SELECT SUM(commission_cents) FROM deals')) / 100, 1)
    for (const r of rows) expect(Number(r.given_up)).toBeCloseTo(Number(r.commission_at_asking) - Number(r.commission), 1)
  })

  it('offered vs sold: no category sells to more customers than had it on the ticket', async () => {
    const rows = await report('patterns-offered-vs-sold')
    expect(rows.length).toBeGreaterThan(3)
    for (const r of rows) expect(Number(r.bought)).toBeLessThanOrEqual(Number(r.customers))
  })
})

describe('deal pattern reports find the planted patterns', () => {
  it('15–35% off the base gets more yeses than under 15%; 35% or more adds nothing', async () => {
    const rows = await report('patterns-base-discount')
    const pct = (band: string) => Number(find(rows, 'off_the_base', band).accepted_pct)
    expect(pct('15–35%')).toBeGreaterThan(pct('Under 15% (or none)') + 5)
    expect(pct('35% or more')).toBeLessThan(pct('15–35%') + 3)
  })

  it('on big tickets, free delivery gets more yeses than charged delivery', async () => {
    const big = (await report('patterns-free-delivery')).filter((r) => r.ticket === 'Big ($2,500+)')
    expect(Number(find(big, 'delivery_on_offer', 'Free (waived)').accepted_pct)).toBeGreaterThan(Number(find(big, 'delivery_on_offer', 'Charged').accepted_pct) + 8)
  })

  it('6-month financing closes more often than no financing', async () => {
    const rows = await report('patterns-financing')
    expect(Number(find(rows, 'financing', '6 months').close_pct)).toBeGreaterThan(Number(find(rows, 'financing', 'None').close_pct) + 10)
  })

  it('Kevin gives up the largest share of his commission to discounting', async () => {
    const rows = await report('patterns-commission-given-up')
    expect(rows[0].rep).toBe(REPS.find((r) => r.id === 'kevin')!.name)
  })
})

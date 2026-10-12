import { describe, expect, it } from 'vitest'
import { evaluate, makeCatalog } from '../src/engine'
import type { Deal, DealLine } from '../src/engine'
import { CATALOG } from '../src/data/catalog'
import { HISTORY_END, HISTORY_START, buildDemoDatabase } from '../src/data/history'
import { DEFAULT_SETTINGS } from '../src/data/settings'
import { demoDatabase, loadSql } from './sqljs'

const ctx = { catalog: makeCatalog(CATALOG), settings: DEFAULT_SETTINGS }

describe('demo history', () => {
  it('covers six months, seven reps, thousands of customers', async () => {
    const { db, summary } = await demoDatabase()
    expect(summary.visits.length).toBeGreaterThan(2500)
    expect(summary.visits.length).toBeLessThan(4500)
    expect(summary.deals.length).toBeGreaterThan(1000)
    const [first, last, reps] = db.exec('SELECT MIN(visited_on), MAX(visited_on), COUNT(DISTINCT rep_id) FROM visits')[0].values[0]
    expect(first).toBe(HISTORY_START)
    expect(last).toBe(HISTORY_END)
    expect(reps).toBe(7)
  })

  it('is identical every time it is built', async () => {
    const { db } = await demoDatabase()
    const fresh = buildDemoDatabase(await loadSql()).db
    const fingerprint = (d: typeof db) =>
      d.exec(`SELECT COUNT(*), SUM(topline_cents), SUM(commission_cents), SUM(gross_cents * id % 9973),
                (SELECT COUNT(*) FROM offers), (SELECT SUM(topline_cents) FROM offers) FROM deals`)[0].values[0]
    expect(fingerprint(fresh)).toEqual(fingerprint(db))
  })

  it('every saved sale matches the engine when re-priced from its lines', async () => {
    const { db } = await demoDatabase()
    const deals = db.exec(`SELECT id, topline_cents, gross_cents, margin_bp, tier_id, rate_bp, attach,
        commission_cents, financing_months, delivery_tier_id, delivery_price_cents, bundle_deals
      FROM deals WHERE id % 7 = 0`)[0].values
    expect(deals.length).toBeGreaterThan(100)
    for (const [id, topline, gross, margin, tier, rate, attach, commission, months, deliveryTier, deliveryPrice, bundle] of deals) {
      const lines: DealLine[] = db
        .exec(`SELECT line_no, sku, condition, qty, discount_cents FROM deal_lines WHERE deal_id = ${id} ORDER BY line_no`)[0]
        .values.map(([n, sku, condition, qty, discount]) => ({
          id: `l${n}`,
          sku: sku as string,
          condition: condition as DealLine['condition'],
          qty: qty as number,
          discountCents: discount as number,
        }))
      const deal: Deal = {
        lines,
        delivery: deliveryTier ? { tierId: deliveryTier as string, priceCents: deliveryPrice as number } : null,
        financingMonths: months as number | null,
        bundleDealIds: bundle ? (bundle as string).split(',') : [],
      }
      const ev = evaluate(deal, ctx)
      expect(ev.ok).toBe(true)
      expect([ev.toplineCents, ev.grossCents, ev.marginBp, ev.tier?.id, ev.rateBp, ev.attach ? 1 : 0, ev.commissionCents]).toEqual([
        topline, gross, margin, tier, rate, attach, commission,
      ])
    }
  })

  it('every sale has exactly one accepted offer, at the sale price', async () => {
    const { db } = await demoDatabase()
    const bad = db.exec(`
      SELECT d.id
      FROM deals d
      LEFT JOIN offers o ON o.deal_id = d.id AND o.accepted = 1
      GROUP BY d.id
      HAVING COUNT(o.id) <> 1 OR MAX(o.topline_cents) <> d.topline_cents`)
    expect(bad).toEqual([])
  })

  it('offers only go down until the accepted one', async () => {
    const { db } = await demoDatabase()
    const rising = db.exec(`
      SELECT a.id
      FROM offers a
      JOIN offers b ON b.visit_id = a.visit_id AND b.step_no = a.step_no + 1
      WHERE b.topline_cents >= a.topline_cents`)
    expect(rising).toEqual([])
  })

  it('walk-outs have no sale, and every sold visit has one', async () => {
    const { db } = await demoDatabase()
    const [soldVisits, deals, walkWithDeal] = db.exec(`
      SELECT (SELECT COUNT(*) FROM visits WHERE sold = 1),
             (SELECT COUNT(*) FROM deals),
             (SELECT COUNT(*) FROM deals d JOIN visits v ON v.id = d.visit_id WHERE v.sold = 0)`)[0].values[0]
    expect(soldVisits).toBe(deals)
    expect(walkWithDeal).toBe(0)
  })

  it('never saves a sale below the floor', async () => {
    const { db } = await demoDatabase()
    expect(db.exec('SELECT COUNT(*) FROM deals WHERE tier_id IS NULL OR margin_bp < 3000')[0].values[0][0]).toBe(0)
  })
})

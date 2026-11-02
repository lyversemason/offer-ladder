// What gets saved when a rep records an outcome (src/data/outcome.ts): every offer
// priced again by the engine from its items, refusals in plain words, and the
// rows the live server saves matching what the demo's database stores.
import { describe, expect, it } from 'vitest'
import { evaluate, makeCatalog } from '../src/engine'
import type { Deal } from '../src/engine'
import { CATALOG } from '../src/data/catalog'
import { REPS, STORES } from '../src/data/org'
import { DEFAULT_SETTINGS } from '../src/data/settings'
import { OutcomeError, outcomeRows, priceOutcome } from '../src/data/outcome'
import { createDatabase, saveDeal, seedCatalog, seedOrg } from '../src/db/database'
import type { OfferRecord } from '../src/db/database'
import type { Outcome } from '../src/source/types'
import { snapshot } from '../src/ui/state'
import { toOfferRecord } from '../src/ui/offers'
import { loadSql } from './sqljs'

const ctx = { catalog: makeCatalog(CATALOG), settings: DEFAULT_SETTINGS }
const SAMPLE: Deal = {
  lines: [
    { id: 'a', sku: '366239-Q', condition: 'new', qty: 1, discountCents: 0 },
    { id: 'b', sku: '365028-Q', condition: 'new', qty: 1, discountCents: 0 },
    { id: 'c', sku: '365983-Q', condition: 'new', qty: 2, discountCents: 0 },
    { id: 'd', sku: '366272-Q', condition: 'new', qty: 1, discountCents: 0 },
  ],
  delivery: { tierId: 'platinum', priceCents: 17999 },
  financingMonths: null,
}
const discounted: Deal = { ...SAMPLE, lines: SAMPLE.lines.map((l) => (l.id === 'a' ? { ...l, discountCents: 20000 } : l)), delivery: { tierId: 'platinum', priceCents: 0 } }
const offer = (deal: Deal, accepted: boolean, reasons: string[] = []) => toOfferRecord(snapshot(deal, evaluate(deal, ctx), DEFAULT_SETTINGS, reasons), accepted)
const outcome = (offers: OfferRecord[], sale: Deal | null): Outcome => ({ repId: 'tasha', storeId: 'riverside', date: '2026-11-01', ticketId: 't-1', offers, sale })

describe('pricing an outcome again', () => {
  it("every offer's totals and lines are the engine's, whatever the screen sent", () => {
    const tampered = offer(discounted, true)
    tampered.commissionCents = 999999
    tampered.detail!.lines[0].netCents = 1
    tampered.detail!.lines[0].costCents = 0
    const priced = priceOutcome(outcome([offer(SAMPLE, false), tampered], discounted), ctx)
    const ev = evaluate(discounted, ctx)
    expect(priced.offers[1].commissionCents).toBe(ev.commissionCents)
    expect(priced.offers[1].detail!.lines[0].netCents).toBe(ev.lines[0].netCents)
    expect(priced.offers[1].detail!.lines[0].costCents).toBe(ev.lines[0].costCents)
    expect(priced.offers[1].detail!.delivery).toEqual({ tierId: 'platinum', listCents: ev.deliveryListCents, priceCents: 0 })
    expect(priced.sale!.ev.commissionCents).toBe(ev.commissionCents)
  })

  it('keeps how each discount was typed and the reasons, but only sensible ones', () => {
    const sent = offer(discounted, true, ['Military', 'x'.repeat(200)])
    sent.detail!.lines[0].discountHow = 'percent'
    sent.detail!.lines[1].discountHow = 'percent' // no discount on this line: dropped
    const priced = priceOutcome(outcome([sent], discounted), ctx)
    expect(priced.offers[0].detail!.lines[0].discountHow).toBe('percent')
    expect(priced.offers[0].detail!.lines[1].discountHow).toBeNull()
    expect(priced.offers[0].detail!.reasons).toEqual(['Military'])
  })

  it('refuses, in plain words, what can’t be saved', () => {
    const refuse = (o: Outcome) => () => priceOutcome(o, ctx)
    const giveaway: Deal = { ...SAMPLE, lines: SAMPLE.lines.map((l) => ({ ...l, discountCents: 1_000_000 })) }
    expect(refuse(outcome([], null))).toThrow(OutcomeError)
    expect(refuse(outcome([offer(giveaway, true)], giveaway))).toThrow(/breaks the store's rules/)
    expect(refuse(outcome([{ ...offer(SAMPLE, false), detail: undefined }], null))).toThrow(/no items/)
    const unknown = offer(SAMPLE, false)
    unknown.detail!.lines[0].sku = 'NOPE-Q'
    expect(refuse(outcome([unknown], null))).toThrow(/isn't in the catalog/)
    expect(refuse(outcome([offer(SAMPLE, true)], null))).toThrow(/walked accepted no offer/)
    expect(refuse(outcome([offer(SAMPLE, false), offer(discounted, false)], discounted))).toThrow(/accepted offer last/)
    expect(refuse(outcome([offer(SAMPLE, true)], discounted))).toThrow(/doesn't match its last offer/)
  })
})

describe('the rows the live server saves', () => {
  it('match, column for column, what the demo’s database stores for the same sale', async () => {
    const db = createDatabase(await loadSql())
    seedOrg(db, STORES, REPS)
    seedCatalog(db, CATALOG)
    const o = outcome([offer(SAMPLE, false), offer(discounted, true, ['Financing'])], discounted)
    const priced = priceOutcome(o, ctx)
    saveDeal(db, { repId: o.repId, storeId: o.storeId, date: o.date, deal: priced.sale!.deal, ev: priced.sale!.ev, offers: priced.offers, ticketId: o.ticketId })
    const rows = outcomeRows(o, priced, o.date)
    const one = (sql: string) => {
      const r = db.exec(sql)[0]
      return r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])))
    }
    // SQLite keeps true/false as 1/0; Postgres as true/false.
    const sqlite = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 1 : 0) : v]))
    const { id: _v, ...visit } = one('SELECT * FROM visits')[0]
    expect(visit).toEqual(sqlite(rows.visit))
    const { id: _d, visit_id: _dv, ...deal } = one('SELECT * FROM deals')[0]
    expect(deal).toEqual(sqlite(rows.deal!))
    expect(one('SELECT line_no, sku, condition, qty, list_cents, discount_cents, net_cents, cost_cents, locked FROM deal_lines ORDER BY line_no')).toEqual(rows.deal_lines.map(sqlite))
    const offers = one('SELECT * FROM offers ORDER BY step_no')
    rows.offers.forEach((r, i) => {
      const { lines, reasons, ...offerRow } = r as Record<string, unknown> & { lines: Record<string, unknown>[]; reasons: string[] }
      const { id, visit_id: _ov, deal_id: _od, ...stored } = offers[i]
      expect(stored).toEqual(sqlite(offerRow))
      expect(one(`SELECT line_no, sku, condition, qty, list_cents, discount_cents, net_cents, cost_cents, locked, discount_how, discount_scope FROM offer_lines WHERE offer_id = ${id} ORDER BY line_no`)).toEqual(lines.map(sqlite))
      expect((db.exec(`SELECT reason FROM offer_reasons WHERE offer_id = ${id} ORDER BY reason_no`)[0]?.values ?? []).map((v) => v[0])).toEqual(reasons)
    })
  })
})

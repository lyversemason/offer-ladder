import { beforeEach, describe, expect, it } from 'vitest'
import type { Database } from 'sql.js'
import { evaluate } from '../src/engine'
import {
  checkReadOnly,
  createDatabase,
  exportBytes,
  importBytes,
  recordVisit,
  runReadOnlyQuery,
  saveDeal,
  seedCatalog,
  seedOrg,
} from '../src/db/database'
import { REPS, STORES } from '../src/data/org'
import { ctx, deal, line, products, whiteGlove } from './fixtures'
import { loadSql } from './sqljs'

let db: Database

beforeEach(async () => {
  db = createDatabase(await loadSql())
  seedOrg(db, STORES, REPS)
  seedCatalog(db, products)
})

const one = (sql: string) => db.exec(sql)[0]?.values[0] ?? []
const count = (table: string) => one(`SELECT COUNT(*) FROM ${table}`)[0] as number

describe('schema', () => {
  it('creates every table', () => {
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")[0].values.flat()
    expect(tables).toEqual([
      'deal_lines', 'deals', 'events', 'offer_lines', 'offer_reasons', 'offers', 'products', 'reps',
      'settings_history', 'stores', 'traffic', 'visits',
    ])
  })

  it('stores the catalog, with empty outlet prices where it isn\'t sold as an outlet piece', () => {
    expect(count('products')).toBe(products.length)
    expect(one("SELECT outlet_list_cents, outlet_cost_cents FROM products WHERE sku = 'M1'")).toEqual([149900, 60000])
    expect(one("SELECT outlet_list_cents FROM products WHERE sku = 'PR1'")).toEqual([null])
  })

  it('refuses a sale for a rep that does not exist (foreign keys are on)', () => {
    expect(() => recordVisit(db, { repId: 'nobody', storeId: 'riverside', date: '2026-05-01', sold: true })).toThrow()
  })
})

describe('saving a deal', () => {
  const d = deal([line('M1', { discountCents: 30000 }), line('B1'), line('P1', { qty: 2 })], {
    delivery: whiteGlove,
    financingMonths: 12,
  })
  const ev = evaluate(d, ctx)

  it('keeps the engine numbers exactly', () => {
    const id = saveDeal(db, { repId: 'tasha', storeId: 'riverside', date: '2026-05-02', deal: d, ev })
    const row = db.exec(`SELECT list_topline_cents, topline_cents, product_cost_cents, delivery_cost_cents,
        gross_cents, margin_bp, tier_id, rate_bp, attach, commission_cents, financing_months,
        financing_adj_cents, delivery_tier_id, delivery_price_cents, tax_cents
      FROM deals WHERE id = ${id}`)[0].values[0]
    expect(row).toEqual([
      ev.listToplineCents, ev.toplineCents, ev.productCostCents, ev.deliveryCostCents,
      ev.grossCents, ev.marginBp, ev.tier!.id, ev.rateBp, 1, ev.commissionCents, 12,
      ev.financingAdjCents, 'white-glove', 14900, ev.taxCents,
    ])
  })

  it('saves every line, and the lines add up to the deal', () => {
    const id = saveDeal(db, { repId: 'tasha', storeId: 'riverside', date: '2026-05-02', deal: d, ev })
    const lines = db.exec(`SELECT sku, qty, list_cents, discount_cents, net_cents, cost_cents, locked
      FROM deal_lines WHERE deal_id = ${id} ORDER BY line_no`)[0].values
    expect(lines.map((l) => l[0])).toEqual(['M1', 'B1', 'P1'])
    expect(lines[0].slice(1)).toEqual([1, 199900, 30000, 169900, 89900, 0])
    expect(lines[2].slice(1, 3)).toEqual([2, 19800])
    const net = lines.reduce((s, l) => s + (l[4] as number), 0)
    expect(net + ev.deliveryPriceCents).toBe(ev.toplineCents)
  })

  it('records a sold visit when none is given', () => {
    saveDeal(db, { repId: 'tasha', storeId: 'riverside', date: '2026-05-02', deal: d, ev })
    expect(one('SELECT rep_id, visited_on, sold FROM visits')).toEqual(['tasha', '2026-05-02', 1])
  })

  it('saves the offers in order and marks the accepted one', () => {
    const offers = [
      { toplineCents: 300000, marginBp: 5500, tierId: 'top', commissionCents: 20000, accepted: false },
      { toplineCents: ev.toplineCents, marginBp: ev.marginBp, tierId: ev.tier!.id, commissionCents: ev.commissionCents, accepted: true },
    ]
    const id = saveDeal(db, { repId: 'tasha', storeId: 'riverside', date: '2026-05-02', deal: d, ev, offers })
    expect(db.exec(`SELECT step_no, accepted FROM offers WHERE deal_id = ${id} ORDER BY step_no`)[0].values).toEqual([
      [0, 0],
      [1, 1],
    ])
    expect(one(`SELECT closed_at_rung, offers_made FROM deals WHERE id = ${id}`)).toEqual([1, 1])
  })

  it('refuses a deal the engine blocked', () => {
    const below = deal([line('M1', { discountCents: 70000 })])
    expect(() =>
      saveDeal(db, { repId: 'tasha', storeId: 'riverside', date: '2026-05-02', deal: below, ev: evaluate(below, ctx) }),
    ).toThrow(/blocked/)
    expect(count('deals')).toBe(0)
  })
})

describe('query lab safety check', () => {
  it('allows SELECT and WITH queries', () => {
    expect(checkReadOnly('SELECT * FROM deals')).toBeNull()
    expect(checkReadOnly('  with x as (select 1 as n) select n from x;')).toBeNull()
  })

  it('ignores keywords inside quotes and comments', () => {
    expect(checkReadOnly("SELECT 'delete me; drop it' AS note -- update later")).toBeNull()
  })

  it('blocks anything that changes data', () => {
    for (const sql of [
      'DELETE FROM deals',
      'delete from deals',
      'UPDATE deals SET commission_cents = 0',
      'INSERT INTO stores VALUES (1, 2)',
      'DROP TABLE deals',
      'WITH x AS (SELECT 1) INSERT INTO stores SELECT 1, 2 FROM x',
      'WITH x AS (SELECT 1) REPLACE INTO stores SELECT 1, 2 FROM x',
      'PRAGMA table_info(deals)',
      "ATTACH DATABASE 'x.db' AS x",
      'SELECT 1; DROP TABLE deals',
      'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n) SELECT COUNT(*) FROM n',
    ]) {
      expect(checkReadOnly(sql), sql).not.toBeNull()
    }
  })

  it('explains the problem in plain words', () => {
    expect(checkReadOnly('SELECT 1; SELECT 2')).toMatch(/one query at a time/)
    expect(checkReadOnly('DELETE FROM deals')).toMatch(/Only SELECT/)
    expect(checkReadOnly('')).toMatch(/Type a query/)
  })

  it('runs a query and cuts it off at the row limit', () => {
    const res = runReadOnlyQuery(db, 'SELECT sku FROM products ORDER BY sku', 3)
    expect(res.columns).toEqual(['sku'])
    expect(res.rows).toHaveLength(3)
    expect(res.truncated).toBe(true)
  })

  it('throws on a blocked query and leaves the data alone', () => {
    expect(() => runReadOnlyQuery(db, 'DELETE FROM products')).toThrow()
    expect(count('products')).toBe(products.length)
  })

  it('reports a SQL mistake as an error', () => {
    expect(() => runReadOnlyQuery(db, 'SELECT nope FROM products')).toThrow(/no such column/)
  })
})

describe('export and import', () => {
  it('round-trips the whole database through bytes', async () => {
    const ev = evaluate(deal([line('M1')]), ctx)
    saveDeal(db, { repId: 'kevin', storeId: 'riverside', date: '2026-06-01', deal: deal([line('M1')]), ev })
    const copy = importBytes(await loadSql(), exportBytes(db))
    expect(copy.exec('SELECT COUNT(*), SUM(commission_cents) FROM deals')[0].values[0]).toEqual([1, ev.commissionCents])
  })
})

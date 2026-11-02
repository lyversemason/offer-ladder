// Saving in live mode (server/save.ts and supabase/migrations/*_saving.sql): who may
// save what, every sale priced again by the engine on the server, refusals in
// plain words with nothing written, and the catalog import matching the demo's.
// Puts the database back as it was afterwards, so the other database tests still
// compare against the untouched demo. Needs `npm run db:start` and `npm run db:reset`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { evaluate, makeCatalog } from '../../src/engine'
import type { Deal, Settings } from '../../src/engine'
import { CATALOG } from '../../src/data/catalog'
import { DEFAULT_SETTINGS } from '../../src/data/settings'
import { createDatabase, readCatalog, seedCatalog } from '../../src/db/database'
import type { OfferRecord } from '../../src/db/database'
import { loadVendorSheet, runCleaningSteps } from '../../src/import/pipeline'
import sampleSheet from '../../src/data/samples/vendor-cost-sheet.csv?raw'
import { createLive } from '../../src/source/live'
import type { AuthState, Live } from '../../src/source/live'
import { memoryStorage, openDemoSource } from '../../src/source/demo'
import type { Outcome } from '../../src/source/types'
import { snapshot } from '../../src/ui/state'
import { toOfferRecord } from '../../src/ui/offers'
import { LOCAL_PASSWORD, connectLocal, localApi } from '../../scripts/local-db'
import { loadSql } from '../sqljs'

const api = localApi()
let db: pg.Client
let before: { visit: number; deal: number; settings: number; products: Record<string, unknown>[] }

const ctx = { catalog: makeCatalog(CATALOG), settings: DEFAULT_SETTINGS }
const SAMPLE: Deal = {
  lines: [
    { id: 'a', sku: '366239-Q', condition: 'new', qty: 1, discountCents: 0 },
    { id: 'b', sku: '365028-Q', condition: 'new', qty: 1, discountCents: 0 },
    { id: 'c', sku: '365983-Q', condition: 'new', qty: 2, discountCents: 0 },
    { id: 'd', sku: '366272-Q', condition: 'new', qty: 1, discountCents: 0 },
  ],
  delivery: { tierId: 'platinum', priceCents: 17999 },
  financingMonths: 6,
}
const DISCOUNTED: Deal = { ...SAMPLE, lines: SAMPLE.lines.map((l) => (l.id === 'a' ? { ...l, discountCents: 20000 } : l)), delivery: { tierId: 'platinum', priceCents: 0 } }
const offer = (deal: Deal, accepted: boolean, reasons: string[] = []): OfferRecord => toOfferRecord(snapshot(deal, evaluate(deal, ctx), DEFAULT_SETTINGS, reasons), accepted)
const outcome = (rep: string, store: string, ticket: string, offers: OfferRecord[], sale: Deal | null): Outcome => ({ repId: rep, storeId: store, date: '2000-01-01', ticketId: ticket, offers, sale })

const sessions = new Map<string, Live>()
async function as(who: string): Promise<Live> {
  if (sessions.has(who)) return sessions.get(who)!
  const live = createLive(api.url, api.anonKey, {
    browser: false,
    workspace: async (products) => {
      const ws = createDatabase(await loadSql())
      seedCatalog(ws, products)
      return ws
    },
  })
  const { error } = await live.client.auth.signInWithPassword({ email: `${who}@lanternlane.test`, password: LOCAL_PASSWORD })
  if (error) throw new Error(`${who}: ${error.message}`)
  await new Promise<AuthState>((resolve) => {
    const check = () => {
      const a = live.auth.get()
      if (a.status === 'ready' || a.status === 'no-access') resolve(a)
    }
    live.auth.subscribe(check)
    check()
  })
  sessions.set(who, live)
  return live
}
const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0]

beforeAll(async () => {
  db = await connectLocal()
  before = {
    visit: Number((await one('SELECT COALESCE(MAX(id), 0) AS n FROM visits')).n),
    deal: Number((await one('SELECT COALESCE(MAX(id), 0) AS n FROM deals')).n),
    settings: Number((await one('SELECT COALESCE(MAX(id), 0) AS n FROM settings_history')).n),
    products: (await db.query('SELECT * FROM products ORDER BY sku')).rows,
  }
})

afterAll(async () => {
  // Back to the untouched demo: remove what these tests saved, restore the catalog.
  await db.query('BEGIN')
  await db.query('DELETE FROM offer_reasons WHERE offer_id IN (SELECT id FROM offers WHERE visit_id > $1)', [before.visit])
  await db.query('DELETE FROM offer_lines WHERE offer_id IN (SELECT id FROM offers WHERE visit_id > $1)', [before.visit])
  await db.query('DELETE FROM offers WHERE visit_id > $1', [before.visit])
  await db.query('DELETE FROM deal_lines WHERE deal_id > $1', [before.deal])
  await db.query('DELETE FROM deals WHERE id > $1', [before.deal])
  await db.query('DELETE FROM visits WHERE id > $1', [before.visit])
  await db.query('DELETE FROM settings_history WHERE id > $1', [before.settings])
  await db.query('DELETE FROM products WHERE NOT (sku = ANY($1))', [before.products.map((p) => p.sku)])
  await db.query(
    `UPDATE products p SET list_cents = b.list_cents, cost_cents = b.cost_cents, outlet_list_cents = b.outlet_list_cents, outlet_cost_cents = b.outlet_cost_cents
     FROM json_populate_recordset(NULL::products, $1) b WHERE b.sku = p.sku`,
    [JSON.stringify(before.products)],
  )
  await db.query('COMMIT')
  await db.end()
})

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

describe('recording a customer', () => {
  it("a rep's sale is saved with the server's numbers, every offer priced again", async () => {
    const tasha = await as('tasha')
    const asking = offer(SAMPLE, false)
    const closing = offer(DISCOUNTED, true, ['Financing'])
    closing.commissionCents = 999_999 // tampered in the browser
    closing.detail!.lines[0].netCents = 1
    asking.commissionCents = 1
    const res = await tasha.source.recordOutcome(outcome('tasha', 'riverside', 't-live-1', [asking, closing], DISCOUNTED))
    const ev = evaluate(DISCOUNTED, ctx)
    expect(res).toEqual({ sale: { toplineCents: ev.toplineCents, commissionCents: ev.commissionCents }, offers: 2 })
    const deal = await one("SELECT d.* FROM deals d JOIN visits v ON v.id = d.visit_id WHERE v.ticket_id = 't-live-1'")
    expect(deal).toMatchObject({ rep_id: 'tasha', commission_cents: ev.commissionCents, topline_cents: ev.toplineCents, closed_on: today, financing_months: 6, attach: ev.attach })
    const offers = (await db.query("SELECT o.* FROM offers o JOIN visits v ON v.id = o.visit_id WHERE v.ticket_id = 't-live-1' ORDER BY step_no")).rows
    expect(offers.map((o) => o.commission_cents)).toEqual([evaluate(SAMPLE, ctx).commissionCents, ev.commissionCents])
    expect(offers.map((o) => o.accepted)).toEqual([false, true])
    expect(offers[1].deal_id).toBe(deal.id)
    expect(Number((await one('SELECT net_cents FROM offer_lines WHERE offer_id = $1 AND line_no = 1', [offers[1].id])).net_cents)).toBe(ev.lines[0].netCents)
    expect((await one('SELECT reason FROM offer_reasons WHERE offer_id = $1', [offers[1].id])).reason).toBe('Financing')
  })

  it('a walk-out is saved with its offers and no sale', async () => {
    const res = await (await as('kevin')).source.recordOutcome(outcome('kevin', 'riverside', 't-live-2', [offer(SAMPLE, false), offer(DISCOUNTED, false)], null))
    expect(res).toEqual({ sale: null, offers: 2 })
    expect(await one("SELECT sold, (SELECT COUNT(*) FROM offers o WHERE o.visit_id = v.id) AS offers FROM visits v WHERE ticket_id = 't-live-2'")).toEqual({ sold: false, offers: 2 })
  })

  it('refuses, in plain words, with nothing written: someone else’s customer, a non-rep, a broken price', async () => {
    const visits = async () => Number((await one('SELECT COUNT(*) AS n FROM visits')).n)
    const n = await visits()
    const tasha = await as('tasha')
    await expect(tasha.source.recordOutcome(outcome('kevin', 'riverside', 't-x', [offer(SAMPLE, false)], null))).rejects.toThrow('You can only record your own customers.')
    await expect((await as('lena')).source.recordOutcome(outcome('tasha', 'riverside', 't-x', [offer(SAMPLE, false)], null))).rejects.toThrow('Only reps record customers.')
    const giveaway: Deal = { ...SAMPLE, lines: SAMPLE.lines.map((l) => ({ ...l, discountCents: 1_000_000 })) }
    await expect(tasha.source.recordOutcome(outcome('tasha', 'riverside', 't-x', [offer(giveaway, true)], giveaway))).rejects.toThrow(/breaks the store's rules/)
    expect(await visits()).toBe(n)
  })

  it('Owen, whose access is off, can’t save anything', async () => {
    const owen = await as('owen')
    await expect(owen.source.recordOutcome(outcome('ben', 'hillcrest', 't-x', [offer(SAMPLE, false)], null))).rejects.toThrow(/access is off/)
  })

  it('the store’s manager sees the new sale in their reports right away; the other store’s doesn’t', async () => {
    const month = today.slice(0, 7)
    const lena = await (await as('lena')).source.runReport('rep-scorecard')
    const row = lena.rows.find((r) => r[0] === month && r[1] === 'Tasha Ortiz')
    expect(row?.[3]).toBe(1) // orders
    const marisol = await (await as('marisol')).source.runReport('rep-scorecard')
    expect(marisol.rows.some((r) => r[1] === 'Tasha Ortiz')).toBe(false)
  })

  it('a browser can’t call the saving functions itself, even signed in', async () => {
    const { error } = await (await as('tasha')).client.rpc('save_outcome', { payload: {} })
    expect(error?.message).toMatch(/permission denied/)
  })
})

describe('the rules', () => {
  it('only an admin saves them; everyone then prices with the new rules', async () => {
    const next: Settings = { ...DEFAULT_SETTINGS, exceptionMarginBp: 2400 }
    await expect((await as('lena')).source.saveSettings(next, today)).rejects.toThrow('Only an admin can change the rules.')
    await (await as('dana')).source.saveSettings(next, today)
    expect((await (await as('tasha')).source.settings()).exceptionMarginBp).toBe(2400)
  })

  it('broken rules are refused with the reason', async () => {
    const broken: Settings = { ...DEFAULT_SETTINGS, tiers: DEFAULT_SETTINGS.tiers.map((t, i) => (i === 0 ? { ...t, rateBp: 100 } : t)) }
    await expect((await as('dana')).source.saveSettings(broken, today)).rejects.toThrow(/weren't saved/)
  })
})

describe('the catalog import', () => {
  it('only an admin applies it, and the catalog ends up the same as the demo’s after the same sheet', async () => {
    const lena = await as('lena')
    await expect(lena.source.applyImport(await cleaned(lena))).rejects.toThrow('Only an admin can change the catalog.')

    const dana = await as('dana')
    const ws = await cleaned(dana)
    const planned = ws.exec("SELECT change, COUNT(*) FROM vendor_changes WHERE change IN ('new', 'changed') GROUP BY change")[0].values
    const want = Object.fromEntries(planned.map(([k, n]) => [k, Number(n)]))
    expect(await dana.source.applyImport(ws)).toEqual({ changed: want.changed, added: want.new })

    const demo = await openDemoSource(await loadSql(), memoryStorage())
    const demoWs = await demo.importWorkspace()
    loadVendorSheet(demoWs, sampleSheet)
    runCleaningSteps(demoWs)
    await demo.applyImport(demoWs)
    const bySku = (list: { sku: string }[]) => [...list].sort((a, b) => a.sku.localeCompare(b.sku))
    expect(bySku(await dana.source.catalog())).toEqual(bySku(await demo.catalog()))
  }, 60_000)

  it('a doctored change list is refused', async () => {
    const dana = await as('dana')
    const ws = await cleaned(dana)
    ws.run("UPDATE vendor_changes SET change = 'changed', new_cost_cents = -5 WHERE rowid = (SELECT MIN(rowid) FROM vendor_changes)")
    await expect(dana.source.applyImport(ws)).rejects.toThrow(/can't be applied/)
  })
})

/** The sample vendor sheet, cleaned in a scratch copy of the person's catalog. */
async function cleaned(live: Live) {
  const ws = await live.source.importWorkspace()
  loadVendorSheet(ws, sampleSheet)
  runCleaningSteps(ws)
  expect(readCatalog(ws).length).toBeGreaterThan(200)
  return ws
}

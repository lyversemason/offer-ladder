// The demo data source (v0.20.0): the one place the screens read and write the
// browser's database. It keeps the demo between visits, prices a sale again with
// the engine (whatever totals the screen sent), saves all or nothing, and runs
// the catalog import in a scratch copy.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { evaluate, makeCatalog } from '../src/engine'
import type { Deal } from '../src/engine'
import { CATALOG } from '../src/data/catalog'
import { DEFAULT_SETTINGS } from '../src/data/settings'
import { loadVendorSheet, runCleaningSteps } from '../src/import/pipeline'
import sampleSheet from '../src/data/samples/vendor-cost-sheet.csv?raw'
import { memoryStorage, openDemoSource } from '../src/source/demo'
import { snapshot } from '../src/ui/state'
import { toOfferRecord } from '../src/ui/offers'
import type { DemoStorage } from '../src/source/demo'
import type { DataSource } from '../src/source/types'
import { loadSql } from './sqljs'

// The same deal as the app's "Load sample deal" button.
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
const ctx = { catalog: makeCatalog(CATALOG), settings: DEFAULT_SETTINGS }
/** An offer as the rep's screen sends it: totals plus every item (what the source prices again). */
const offer = (deal: Deal, accepted: boolean) => toOfferRecord(snapshot(deal, evaluate(deal, ctx), DEFAULT_SETTINGS, []), accepted)

let saved: Uint8Array | null = null
/** Storage that starts from the copy the first test saved, so only one test builds the history. */
function storageWithCopy(): DemoStorage {
  const s = memoryStorage()
  return { ...s, loadDb: async () => ({ ok: true, bytes: saved }), saveDb: () => {} }
}
async function open(): Promise<DataSource> {
  return openDemoSource(await loadSql(), storageWithCopy())
}
async function count(source: DataSource, sql: string): Promise<number> {
  return Number((await source.runQuery(sql)).rows[0][0])
}

beforeAll(async () => {
  const storage = memoryStorage()
  const first = await openDemoSource(await loadSql(), { ...storage, saveDb: (b) => (saved = b) })
  expect(first.saving).toBe(true)
}, 60_000)

describe('opening the demo', () => {
  it('builds the history on the first visit and saves a copy; later visits read the copy', async () => {
    expect(saved).not.toBeNull()
    const again = await open()
    expect(await count(again, 'SELECT COUNT(*) FROM visits')).toBeGreaterThan(2000)
  })

  it("when storage doesn't answer, it still opens but saves nothing", async () => {
    const writes: Uint8Array[] = []
    const source = await openDemoSource(await loadSql(), {
      ...memoryStorage(),
      loadDb: async () => ({ ok: false }),
      saveDb: (b) => writes.push(b),
    })
    expect(source.saving).toBe(false)
    await source.logEvents([{ at: '2026-11-02 10:00:00', repId: 'tasha', storeId: 'riverside', sessionId: 's', ticketId: null, type: 'session_started' }])
    await source.saveSettings(DEFAULT_SETTINGS, '2026-11-02')
    expect(writes).toHaveLength(0)
  }, 60_000)
})

describe('recording an outcome', () => {
  it("saves a sale with the engine's numbers, not the ones the screen sent", async () => {
    const source = await open()
    const ev = evaluate(SAMPLE, ctx)
    // A tampered offer: ten times the real commission.
    const offers = [{ ...offer(SAMPLE, true), commissionCents: ev.commissionCents * 10 }]
    const res = await source.recordOutcome({ repId: 'tasha', storeId: 'riverside', date: '2026-11-02', ticketId: 't-test', offers, sale: SAMPLE })
    expect(res.sale).toEqual({ toplineCents: ev.toplineCents, commissionCents: ev.commissionCents })
    expect(await count(source, "SELECT commission_cents FROM deals WHERE closed_on = '2026-11-02'")).toBe(ev.commissionCents)
    expect(await count(source, "SELECT o.commission_cents FROM offers o JOIN visits v ON v.id = o.visit_id WHERE v.ticket_id = 't-test'")).toBe(ev.commissionCents)
  })

  it('refuses a sale the engine blocks, and writes nothing at all', async () => {
    const source = await open()
    const before = await count(source, 'SELECT COUNT(*) FROM visits')
    const giveaway: Deal = { ...SAMPLE, lines: SAMPLE.lines.map((l) => ({ ...l, discountCents: 1_000_000 })) }
    const offers = [offer(giveaway, true)]
    await expect(source.recordOutcome({ repId: 'tasha', storeId: 'riverside', date: '2026-11-02', ticketId: 't-x', offers, sale: giveaway })).rejects.toThrow()
    expect(await count(source, 'SELECT COUNT(*) FROM visits')).toBe(before)
  })

  it('saves a walk-out with its offers, and refuses one that says an offer was accepted', async () => {
    const source = await open()
    const asking = offer(SAMPLE, false)
    const res = await source.recordOutcome({ repId: 'kevin', storeId: 'riverside', date: '2026-11-02', ticketId: 't-walk', offers: [asking], sale: null })
    expect(res).toEqual({ sale: null, offers: 1 })
    expect(await count(source, "SELECT COUNT(*) FROM visits WHERE ticket_id = 't-walk' AND sold = 0")).toBe(1)
    await expect(
      source.recordOutcome({ repId: 'kevin', storeId: 'riverside', date: '2026-11-02', ticketId: 't-bad', offers: [{ ...asking, accepted: true }], sale: null }),
    ).rejects.toThrow(/walked/)
  })
})

describe('the rest of what the screens do', () => {
  it('usage events are added, and listeners hear about it once the burst pauses', async () => {
    vi.useFakeTimers()
    try {
      const source = await open()
      let heard = 0
      source.subscribe(() => heard++)
      const e = { at: '2026-11-02 10:00:00', repId: 'tasha', storeId: 'riverside', sessionId: 's-new', ticketId: null, type: 'session_started' }
      await source.logEvents([e])
      await source.logEvents([{ ...e, type: 'lookup_opened' }])
      expect(heard).toBe(0)
      vi.advanceTimersByTime(1100)
      expect(heard).toBe(1)
      expect(await count(source, "SELECT COUNT(*) FROM events WHERE session_id = 's-new'")).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('new rules are kept in the history and become the rules in force', async () => {
    const source = await open()
    const next = { ...DEFAULT_SETTINGS, exceptionMarginBp: 2500 }
    await source.saveSettings(next, '2026-11-02 09:00')
    expect((await source.settings()).exceptionMarginBp).toBe(2500)
    expect(await count(source, 'SELECT COUNT(*) FROM settings_history')).toBe(2)
  })

  it('the catalog import cleans in a scratch copy and applies only the approved changes', async () => {
    const source = await open()
    const ws = await source.importWorkspace()
    expect(Number(ws.exec('SELECT COUNT(*) FROM products')[0].values[0][0])).toBe((await source.catalog()).length)
    loadVendorSheet(ws, sampleSheet)
    runCleaningSteps(ws)
    const planned = ws.exec("SELECT change, COUNT(*) FROM vendor_changes WHERE change IN ('new', 'changed') GROUP BY change")[0].values
    const want = Object.fromEntries(planned.map(([k, n]) => [k, Number(n)]))
    const before = (await source.catalog()).length
    expect(await source.applyImport(ws)).toEqual({ changed: want.changed ?? 0, added: want.new ?? 0 })
    expect((await source.catalog()).length).toBe(before + (want.new ?? 0))
    // The cleaning tables never touched the real database.
    expect(await count(source, "SELECT COUNT(*) FROM sqlite_schema WHERE name LIKE 'vendor%'")).toBe(0)
  })

  it('the query lab only reads', async () => {
    const source = await open()
    await expect(source.runQuery('DELETE FROM deals')).rejects.toThrow()
  })

  it('reset rebuilds the demo, dropping what was recorded', async () => {
    const source = await open()
    await source.recordOutcome({ repId: 'tasha', storeId: 'riverside', date: '2026-11-02', ticketId: 't-r', offers: [offer(SAMPLE, true)], sale: SAMPLE })
    await source.reset()
    expect(await count(source, "SELECT COUNT(*) FROM deals WHERE closed_on = '2026-11-02'")).toBe(0)
  }, 60_000)
})

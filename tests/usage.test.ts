// Usage tracking: the events table, the tracker that writes it (sittings, tickets),
// full offers (every line, how each discount was entered) and the ticket state
// that remembers how discounts were entered.
import { beforeEach, describe, expect, it } from 'vitest'
import type { Database } from 'sql.js'
import { evaluate } from '../src/engine'
import { createDatabase, logEvent, recordTraffic, recordVisit, recordWalkOffers, saveDeal, seedCatalog, seedOrg } from '../src/db/database'
import { REPS, STORES } from '../src/data/org'
import { createTracker, needsNewSession, SESSION_GAP_MS, stamp } from '../src/ui/usage'
import type { SessionState } from '../src/ui/usage'
import { dealReducer, emptyState, snapshot } from '../src/ui/state'
import type { DealState } from '../src/ui/state'
import { toOfferRecord } from '../src/ui/rep/RecordOutcome'
import { ctx, deal, line, products, whiteGlove } from './fixtures'
import { loadSql } from './sqljs'

let db: Database

beforeEach(async () => {
  db = createDatabase(await loadSql())
  seedOrg(db, STORES, REPS)
  seedCatalog(db, products)
})

const rows = (sql: string) => db.exec(sql)[0]?.values ?? []

const event = { at: '2026-11-01 10:00:00', repId: 'tasha', storeId: 'riverside', sessionId: 's1', ticketId: null, type: 'session_started' }

describe('the events table', () => {
  it('adds rows', () => {
    logEvent(db, event)
    logEvent(db, { ...event, ticketId: 't1', type: 'item_added', how: 'sku', sku: 'M1' })
    expect(rows('SELECT type, ticket_id, how, sku FROM events ORDER BY id')).toEqual([
      ['session_started', null, null, null],
      ['item_added', 't1', 'sku', 'M1'],
    ])
  })

  it('is add-only: changing or deleting a row is refused', () => {
    logEvent(db, event)
    expect(() => db.run("UPDATE events SET type = 'x'")).toThrow(/add-only/)
    expect(() => db.run('DELETE FROM events')).toThrow(/add-only/)
    expect(rows('SELECT COUNT(*) FROM events')).toEqual([[1]])
  })

  it('refuses an event for a rep who does not exist', () => {
    expect(() => logEvent(db, { ...event, repId: 'nobody' })).toThrow()
  })
})

describe('traffic', () => {
  it('keeps one count per rep per day', () => {
    recordTraffic(db, { day: '2026-11-01', repId: 'tasha', storeId: 'riverside', ups: 11 })
    expect(() => recordTraffic(db, { day: '2026-11-01', repId: 'tasha', storeId: 'riverside', ups: 3 })).toThrow()
    expect(rows('SELECT ups FROM traffic')).toEqual([[11]])
  })
})

describe('sittings (sessions)', () => {
  const s: SessionState = { id: 's1', repId: 'tasha', lastAt: 1_000_000 }
  it('starts one when there is none, for another rep, or after 30 quiet minutes', () => {
    expect(needsNewSession(null, 'tasha', 1_000_000)).toBe(true)
    expect(needsNewSession(s, 'kevin', 1_000_001)).toBe(true)
    expect(needsNewSession(s, 'tasha', 1_000_000 + SESSION_GAP_MS)).toBe(false)
    expect(needsNewSession(s, 'tasha', 1_000_001 + SESSION_GAP_MS)).toBe(true)
  })

  it('writes time as store time, to the second', () => {
    expect(stamp(new Date(2026, 10, 1, 9, 5, 7))).toBe('2026-11-01 09:05:07')
  })
})

describe('the tracker', () => {
  function setup() {
    let clock = new Date(2026, 10, 1, 10, 0, 0)
    let sessions = 0
    let writes = 0
    const state = { rep: { id: 'tasha', storeId: 'riverside' }, ticket: { id: 't1', started: false } }
    const tracker = createTracker({
      db: () => db,
      rep: () => state.rep,
      ticket: () => state.ticket,
      markStarted: () => (state.ticket = { ...state.ticket, started: true }),
      onWrite: () => writes++,
      now: () => clock,
      newSessionId: () => `s${++sessions}`,
    })
    const advance = (minutes: number) => (clock = new Date(clock.getTime() + minutes * 60_000))
    return { tracker, state, advance, writes: () => writes }
  }
  const log = () => rows('SELECT session_id, ticket_id, type, how FROM events ORDER BY id')

  it('starts a sitting when the rep opens the app, and only once', () => {
    const { tracker } = setup()
    tracker.ensureSession()
    tracker.ensureSession()
    expect(log()).toEqual([['s1', null, 'session_started', null]])
  })

  it('starts the ticket with its first item; screens opened before that belong to no ticket', () => {
    const { tracker } = setup()
    tracker.track('lookup_opened')
    tracker.track('item_added', { how: 'lookup', sku: 'M1' })
    tracker.track('item_added', { how: 'sku', sku: 'B1' })
    expect(log()).toEqual([
      ['s1', null, 'session_started', null],
      ['s1', null, 'lookup_opened', null],
      ['s1', 't1', 'ticket_started', null],
      ['s1', 't1', 'item_added', 'lookup'],
      ['s1', 't1', 'item_added', 'sku'],
    ])
  })

  it('starts a new sitting after 30 quiet minutes, and when someone else takes over', () => {
    const { tracker, state, advance } = setup()
    tracker.track('item_added', { how: 'sku', sku: 'M1' })
    advance(29)
    tracker.track('gm_calculator_opened')
    advance(31)
    tracker.track('gm_calculator_opened')
    state.rep = { id: 'kevin', storeId: 'riverside' }
    tracker.track('inventory_opened')
    expect(rows("SELECT session_id, rep_id FROM events WHERE type = 'session_started'")).toEqual([
      ['s1', 'tasha'],
      ['s2', 'tasha'],
      ['s3', 'kevin'],
    ])
  })

  it('writes nothing while the database is loading', () => {
    const tracker = createTracker({
      db: () => null,
      rep: () => ({ id: 'tasha', storeId: 'riverside' }),
      ticket: () => ({ id: 't1', started: false }),
      markStarted: () => {},
      onWrite: () => {},
    })
    expect(() => tracker.track('item_added')).not.toThrow()
  })
})

describe('the ticket remembers how each discount was entered', () => {
  const start = (): DealState => {
    let s = emptyState()
    s = dealReducer(s, { type: 'add', sku: 'M1' })
    s = dealReducer(s, { type: 'add', sku: 'B1' })
    return s
  }

  it('marks a line discount, and forgets it when the discount goes or the item changes', () => {
    let s = start()
    const [m, b] = s.deal.lines
    s = dealReducer(s, { type: 'discount', lineId: m.id, discountCents: 20000, via: { how: 'percent', scope: 'row' } })
    s = dealReducer(s, { type: 'discount', lineId: b.id, discountCents: 10000, via: { how: 'dollars', scope: 'row' } })
    expect(s.lineVia).toEqual({ [m.id]: { how: 'percent', scope: 'row' }, [b.id]: { how: 'dollars', scope: 'row' } })
    s = dealReducer(s, { type: 'discount', lineId: m.id, discountCents: 0 })
    s = dealReducer(s, { type: 'remove', lineId: b.id })
    expect(s.lineVia).toEqual({})
  })

  it('marks every discounted line after a whole-ticket discount', () => {
    let s = start()
    const priced = { ...s.deal, lines: s.deal.lines.map((l) => ({ ...l, discountCents: 5000 })) }
    s = dealReducer(s, { type: 'replace', deal: priced, via: { how: 'new_price', scope: 'ticket' } })
    expect(Object.values(s.lineVia)).toEqual([
      { how: 'new_price', scope: 'ticket' },
      { how: 'new_price', scope: 'ticket' },
    ])
  })

  it('gives every new customer a new ticket id', () => {
    const s = start()
    const next = dealReducer({ ...s, started: true }, { type: 'clear' })
    expect(next.ticketId).not.toBe(s.ticketId)
    expect(next.started).toBe(false)
    expect(dealReducer(s, { type: 'started' }).started).toBe(true)
  })
})

describe('full offers', () => {
  const d = deal([line('M1', { discountCents: 30000 }), line('B1'), line('P1', { qty: 2, discountCents: 19800 })], {
    delivery: whiteGlove,
    financingMonths: 12,
  })
  const ev = evaluate(d, ctx)
  const [m, , p] = d.lines
  const via = { [m.id]: { how: 'dollars' as const, scope: 'row' as const }, [p.id]: { how: 'percent' as const, scope: 'row' as const } }
  const offer = snapshot(d, ev, ctx.settings, ['Military', 'Google review'], via)

  it('freezes every line with its cost and how its discount was entered', () => {
    expect(offer.lines.map((l) => [l.sku, l.netCents, l.costCents, l.discountHow])).toEqual([
      ['M1', 169900, 89900, 'dollars'],
      ['B1', 129900, 65000, null],
      ['P1', 0, 6000, 'percent'],
    ])
    expect(offer.delivery?.tierId).toBe('white-glove')
  })

  it('saves a sale with every offer line by line, plus delivery, financing and reasons', () => {
    saveDeal(db, { repId: 'tasha', storeId: 'riverside', date: '2026-11-01', deal: d, ev, offers: [toOfferRecord(offer, true)], ticketId: 't9' })
    expect(rows('SELECT ticket_id, sold FROM visits')).toEqual([['t9', 1]])
    expect(rows('SELECT delivery_tier_id, delivery_list_cents, delivery_price_cents, financing_months, accepted FROM offers')).toEqual([
      ['white-glove', 14900, 14900, 12, 1],
    ])
    expect(rows('SELECT line_no, sku, qty, list_cents, discount_cents, net_cents, cost_cents, discount_how, discount_scope FROM offer_lines ORDER BY line_no')).toEqual([
      [1, 'M1', 1, 199900, 30000, 169900, 89900, 'dollars', 'row'],
      [2, 'B1', 1, 129900, 0, 129900, 65000, null, null],
      [3, 'P1', 2, 19800, 19800, 0, 6000, 'percent', 'row'],
    ])
    expect(rows('SELECT reason_no, reason FROM offer_reasons ORDER BY reason_no')).toEqual([
      [1, 'Military'],
      [2, 'Google review'],
    ])
  })

  it('saves the offers made to a customer who walked, with their lines', () => {
    const visitId = recordVisit(db, { repId: 'kevin', storeId: 'riverside', date: '2026-11-01', sold: false, ticketId: 't10' })
    recordWalkOffers(db, visitId, [toOfferRecord(offer, false)])
    expect(rows('SELECT o.deal_id, COUNT(l.line_no) FROM offers o JOIN offer_lines l ON l.offer_id = o.id GROUP BY o.id')).toEqual([[null, 3]])
  })

  it('keeps older history readable: an offer without lines saves only its total', () => {
    const visitId = recordVisit(db, { repId: 'kevin', storeId: 'riverside', date: '2026-11-01', sold: false })
    recordWalkOffers(db, visitId, [{ toplineCents: 100000, marginBp: 5000, tierId: 'top', commissionCents: 7500, accepted: false }])
    expect(rows('SELECT delivery_tier_id, financing_months FROM offers')).toEqual([[null, null]])
    expect(rows('SELECT COUNT(*) FROM offer_lines')).toEqual([[0]])
  })
})

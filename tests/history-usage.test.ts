// The demo history's usage layer (v0.15.0): full offers, usage events, traffic,
// and the patterns planted in src/data/habits.ts. If a pattern test fails after
// a change to the simulator, the screens built on it would stop telling the story.
import { describe, expect, it } from 'vitest'
import { BASE_HELPS_FROM_BP, BASE_STOPS_HELPING_BP, BIG_TICKET_CENTS } from '../src/data/habits'
import { REPS } from '../src/data/org'
import { demoDatabase } from './sqljs'

async function rows(sql: string) {
  const { db } = await demoDatabase()
  return db.exec(sql)[0]?.values ?? []
}
async function one(sql: string) {
  return (await rows(sql))[0]?.[0]
}
/** A per-rep number as { repId: value }. */
async function byRep(sql: string): Promise<Record<string, number>> {
  return Object.fromEntries((await rows(sql)).map(([id, v]) => [id as string, Number(v)]))
}
const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0][0]
const bottom = (m: Record<string, number>) => Object.entries(m).sort((a, b) => a[1] - b[1])[0][0]

describe('what the app recorded', () => {
  it('every offer is saved line by line, and its lines add up to its price', async () => {
    expect(await one('SELECT COUNT(*) FROM offers o WHERE NOT EXISTS (SELECT 1 FROM offer_lines l WHERE l.offer_id = o.id)')).toBe(0)
    expect(
      await one(`SELECT COUNT(*) FROM offers o
        WHERE o.topline_cents <> (SELECT SUM(net_cents) FROM offer_lines l WHERE l.offer_id = o.id) + COALESCE(o.delivery_price_cents, 0)`),
    ).toBe(0)
  })

  it('a discounted line always says how its discount was entered, and an undiscounted one never does', async () => {
    expect(await one('SELECT COUNT(*) FROM offer_lines WHERE (discount_cents <> 0) <> (discount_how IS NOT NULL)')).toBe(0)
    expect(await one("SELECT COUNT(*) FROM offer_lines WHERE discount_how NOT IN ('dollars', 'percent', 'new_price')")).toBe(0)
  })

  it('every recorded customer has a ticket in the usage log, started before it ended', async () => {
    expect(await one('SELECT COUNT(*) FROM visits WHERE ticket_id IS NULL')).toBe(0)
    expect(
      await one(`SELECT COUNT(*) FROM visits v
        WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.ticket_id = v.ticket_id AND e.type = 'ticket_started')
           OR NOT EXISTS (SELECT 1 FROM events e WHERE e.ticket_id = v.ticket_id AND e.type = 'outcome_recorded')`),
    ).toBe(0)
    expect(
      await one(`SELECT COUNT(*) FROM events s JOIN events o ON o.ticket_id = s.ticket_id
        WHERE s.type = 'ticket_started' AND o.type = 'outcome_recorded' AND (o.at < s.at OR o.id < s.id)`),
    ).toBe(0)
  })

  it('every ticket ends exactly once: an outcome or dropped', async () => {
    expect(
      await one(`SELECT COUNT(*) FROM (
        SELECT ticket_id FROM events WHERE ticket_id IS NOT NULL
        GROUP BY ticket_id
        HAVING SUM(type IN ('outcome_recorded', 'ticket_abandoned')) <> 1)`),
    ).toBe(0)
  })

  it('a rep never starts more tickets on a day than the customers the store counted', async () => {
    expect(
      await one(`SELECT COUNT(*) FROM traffic t
        WHERE t.ups < (SELECT COUNT(*) FROM events e
                       WHERE e.rep_id = t.rep_id AND e.type = 'ticket_started' AND substr(e.at, 1, 10) = t.day)`),
    ).toBe(0)
  })

  it('every event belongs to a sitting that starts with session_started', async () => {
    expect(
      await one(`SELECT COUNT(*) FROM (
        SELECT session_id, MIN(id) AS first FROM events GROUP BY session_id) s
        JOIN events e ON e.id = s.first WHERE e.type <> 'session_started'`),
    ).toBe(0)
  })

  it('the store is open from 10 in the morning', async () => {
    expect(await one("SELECT COUNT(*) FROM events WHERE substr(at, 12, 5) < '10:00'")).toBe(0)
  })
})

describe('the reps\' tool habits (planted)', () => {
  const coverage = `SELECT t.rep_id, 1.0 * (SELECT COUNT(*) FROM events e WHERE e.rep_id = t.rep_id AND e.type = 'ticket_started') / SUM(t.ups)
                    FROM traffic t GROUP BY t.rep_id`

  it('Tasha uses the app with the largest share of her customers; Ben the smallest', async () => {
    const c = await byRep(coverage)
    expect(top(c)).toBe('tasha')
    expect(bottom(c)).toBe('ben')
  })

  it('Sofia uses it more by the end than at the start', async () => {
    const [first, last] = await rows(`SELECT 1.0 * (SELECT COUNT(*) FROM events e WHERE e.rep_id = 'sofia' AND e.type = 'ticket_started'
                                              AND substr(e.at, 1, 7) = substr(t.day, 1, 7)) / SUM(t.ups)
                                      FROM traffic t WHERE t.rep_id = 'sofia' AND substr(t.day, 1, 7) IN ('2026-04', '2026-09')
                                      GROUP BY substr(t.day, 1, 7) ORDER BY 1`)
    expect(Number(last[0])).toBeGreaterThan(Number(first[0]) + 0.1)
  })

  it('Sofia leans on Look up and Inventory the most', async () => {
    const share = await byRep(`SELECT rep_id, AVG(how IN ('lookup', 'inventory')) FROM events WHERE type = 'item_added' GROUP BY rep_id`)
    expect(top(share)).toBe('sofia')
  })

  it('Kevin drops the most tickets without an outcome and tries the most refused prices', async () => {
    expect(top(await byRep("SELECT rep_id, COUNT(*) FROM events WHERE type = 'ticket_abandoned' GROUP BY rep_id"))).toBe('kevin')
    expect(top(await byRep("SELECT rep_id, COUNT(*) FROM events WHERE type = 'floor_refused' GROUP BY rep_id"))).toBe('kevin')
  })

  it('Kevin discounts the base on its own row most; Marcus makes delivery free most', async () => {
    const baseRows = await byRep(`SELECT o.rep_id, AVG(l.discount_scope = 'row')
      FROM offer_lines l JOIN products p ON p.sku = l.sku
      JOIN (SELECT o.id, v.rep_id FROM offers o JOIN visits v ON v.id = o.visit_id) o ON o.id = l.offer_id
      WHERE p.category = 'adjustable-base' AND l.discount_cents > 0 GROUP BY o.rep_id`)
    expect(top(baseRows)).toBe('kevin')
    const freeDelivery = await byRep(`SELECT v.rep_id, AVG(o.delivery_price_cents = 0)
      FROM offers o JOIN visits v ON v.id = o.visit_id
      WHERE o.step_no > 0 AND o.delivery_list_cents > 0 GROUP BY v.rep_id`)
    expect(top(freeDelivery)).toBe('marcus')
  })

  it('Ben tries the most prices per ticket and records the fewest offers per ticket', async () => {
    const perTicket = (type: string) =>
      byRep(`SELECT rep_id, 1.0 * SUM(type = '${type}') / SUM(type = 'ticket_started') FROM events GROUP BY rep_id`)
    expect(top(await perTicket('discount_applied'))).toBe('ben')
    expect(bottom(await perTicket('offer_recorded'))).toBe('ben')
  })

  it('has events for all seven reps', async () => {
    expect(Object.keys(await byRep('SELECT rep_id, COUNT(*) FROM events GROUP BY rep_id')).sort()).toEqual(REPS.map((r) => r.id).sort())
  })
})

describe('the customer patterns (planted)', () => {
  /** Close rate of recorded customers in each group a SQL expression puts them in. */
  async function closeRate(groupSql: string): Promise<Record<string, number>> {
    return byRep(`WITH v AS (
        SELECT v.id, v.sold,
          (SELECT topline_cents FROM offers o WHERE o.visit_id = v.id AND o.step_no = 0) AS asking,
          (SELECT MAX(o.delivery_price_cents = 0 AND o.delivery_list_cents > 0) FROM offers o WHERE o.visit_id = v.id) AS free,
          (SELECT MAX(o.financing_months) FROM offers o WHERE o.visit_id = v.id) AS months,
          (SELECT MAX(10000 * l.discount_cents / l.list_cents)
             FROM offers o JOIN offer_lines l ON l.offer_id = o.id JOIN products p ON p.sku = l.sku
             WHERE o.visit_id = v.id AND p.category = 'adjustable-base') AS base_cut
        FROM visits v)
      SELECT ${groupSql} AS g, AVG(sold) FROM v WHERE asking IS NOT NULL GROUP BY g`)
  }

  it('free delivery on a big ticket closes more often', async () => {
    const r = await closeRate(`CASE WHEN asking < ${BIG_TICKET_CENTS} THEN 'small' WHEN free = 1 THEN 'big free' ELSE 'big paid' END`)
    expect(r['big free']).toBeGreaterThan(r['big paid'] + 0.15)
  })

  it('6-month financing closes more often than no financing', async () => {
    const r = await closeRate("CASE WHEN months = 6 THEN 'six' WHEN months IS NULL THEN 'none' ELSE 'other' END")
    expect(r.six).toBeGreaterThan(r.none + 0.05)
  })

  /** Share of offers (after the asking price) the customer said yes to, per group. */
  async function acceptRate(groupSql: string, where = '1 = 1'): Promise<Record<string, number>> {
    return byRep(`WITH o AS (
        SELECT o.accepted, o.delivery_list_cents,
          (SELECT topline_cents FROM offers a WHERE a.visit_id = o.visit_id AND a.step_no = 0) AS asking,
          o.delivery_list_cents > 0 AND o.delivery_price_cents = 0 AS free,
          (SELECT MAX(10000 * l.discount_cents / l.list_cents)
             FROM offer_lines l JOIN products p ON p.sku = l.sku
             WHERE l.offer_id = o.id AND p.category = 'adjustable-base' AND l.locked = 0) AS base_cut
        FROM offers o WHERE o.step_no > 0)
      SELECT ${groupSql} AS g, AVG(accepted) FROM o WHERE ${where} GROUP BY g`)
  }

  it('an offer with 15% or more off the base gets a yes more often, but past 35% no more', async () => {
    const r = await acceptRate(
      `CASE WHEN base_cut < ${BASE_HELPS_FROM_BP} THEN 'small' WHEN base_cut < ${BASE_STOPS_HELPING_BP} THEN 'helps' ELSE 'deep' END`,
      'base_cut IS NOT NULL',
    )
    expect(r.helps).toBeGreaterThan(r.small + 0.05)
    expect(r.deep).toBeLessThan(r.helps + 0.03)
  })

  it('on a big ticket, an offer with free delivery gets a yes more often', async () => {
    const r = await acceptRate("CASE WHEN free THEN 'free' ELSE 'charged' END", `asking >= ${BIG_TICKET_CENTS} AND delivery_list_cents > 0`)
    expect(r.free).toBeGreaterThan(r.charged + 0.08)
  })
})

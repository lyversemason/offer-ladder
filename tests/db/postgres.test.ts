// The local Postgres database (supabase/): it holds exactly the demo's data, every
// report gives the same answers there as in the browser's SQLite, and its rules
// refuse what they should. Needs `npm run db:start` and `npm run db:reset` first.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { runReport } from '../../src/db/database'
import { ALL_REPORTS, postgresFile, postgresSql } from '../../src/db/reports'
import { TABLE_ORDER, connectLocal, localApi } from '../../scripts/local-db'
import { demoDatabase } from '../sqljs'

let db: pg.Client
beforeAll(async () => {
  db = await connectLocal()
})
afterAll(async () => {
  await db?.end()
})

/** Runs SQL that should be refused, inside a transaction that's always undone. */
async function refused(sql: string): Promise<string> {
  await db.query('BEGIN')
  try {
    await db.query(sql)
    return 'accepted'
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  } finally {
    await db.query('ROLLBACK')
  }
}

describe('the data', () => {
  it.each(TABLE_ORDER)('%s has the same number of rows as the browser demo', async (table) => {
    const { db: demo } = await demoDatabase()
    const sqlite = demo.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0]
    const { rows } = await db.query(`SELECT COUNT(*) AS n FROM ${table}`)
    expect(rows[0].n).toBe(sqlite)
  })
})

describe('every report gives the same answer in Postgres and SQLite', () => {
  it.each(ALL_REPORTS.map((r) => [r.id, postgresFile(r)]))('%s (%s)', async (id) => {
    const { db: demo } = await demoDatabase()
    const report = ALL_REPORTS.find((r) => r.id === id)!
    const lite = runReport(demo, id)
    const res = await db.query({ text: postgresSql(report), rowMode: 'array' })
    expect(res.fields.map((f) => f.name)).toEqual(lite.columns)
    expect(res.rows.length).toBe(lite.rows.length)
    res.rows.forEach((row: unknown[], i: number) => {
      row.forEach((v, c) => {
        const want = lite.rows[i][c]
        if (typeof want === 'number' && typeof v === 'number') {
          // Postgres rounds exact decimals; SQLite rounds binary fractions, so a
          // value right on a ...5 can land 0.01 apart (an average now and then does).
          expect(Math.abs(v - want), `${lite.columns[c]} row ${i + 1}`).toBeLessThanOrEqual(0.01 + 1e-9)
        } else {
          expect(v, `${lite.columns[c]} row ${i + 1}`).toEqual(want)
        }
      })
    })
  })
})

describe('the database refuses what it should', () => {
  it('usage events can only be added: no changes, deletes or emptying', async () => {
    expect(await refused("UPDATE events SET how = 'sku' WHERE id = 1")).toMatch(/add-only/)
    expect(await refused('DELETE FROM events WHERE id = 1')).toMatch(/add-only/)
    expect(await refused('TRUNCATE events CASCADE')).toMatch(/add-only/)
  })

  it('a sale or visit must point at a real rep, store and customer', async () => {
    expect(await refused("INSERT INTO visits (rep_id, store_id, visited_on, sold) VALUES ('nobody', 'riverside', '2026-10-01', false)")).toMatch(/foreign key/)
    expect(await refused('INSERT INTO deal_lines SELECT 999999, line_no, sku, condition, qty, list_cents, discount_cents, net_cents, cost_cents, locked FROM deal_lines LIMIT 1')).toMatch(/foreign key/)
  })

  it('values that cannot be right are refused', async () => {
    expect(await refused("UPDATE deal_lines SET condition = 'used' WHERE deal_id = 1")).toMatch(/check constraint/)
    expect(await refused('UPDATE deal_lines SET qty = 0 WHERE deal_id = 1')).toMatch(/check constraint/)
    expect(await refused("UPDATE offer_lines SET discount_how = 'coupon' WHERE discount_how IS NOT NULL")).toMatch(/check constraint/)
    expect(await refused("INSERT INTO events (at, rep_id, store_id, session_id, type) VALUES ('2026-10-01 12:00', 'tasha', 'riverside', 's', 'keystroke')")).toMatch(/check constraint/)
    expect(await refused("UPDATE visits SET visited_on = '2026-02-30' WHERE id = 1")).toMatch(/out of range|invalid/)
  })

  it('a customer can only have one sale', async () => {
    expect(await refused('INSERT INTO deals SELECT * FROM deals WHERE id = 1 ON CONFLICT (id) DO NOTHING; INSERT INTO deals (visit_id, rep_id, store_id, closed_on, list_topline_cents, topline_cents, product_cost_cents, delivery_cost_cents, gross_cents, margin_bp, rate_bp, attach, commission_cents, financing_adj_cents, delivery_price_cents, tax_cents, offers_made, closed_at_rung) SELECT visit_id, rep_id, store_id, closed_on, list_topline_cents, topline_cents, product_cost_cents, delivery_cost_cents, gross_cents, margin_bp, rate_bp, attach, commission_cents, financing_adj_cents, delivery_price_cents, tax_cents, offers_made, closed_at_rung FROM deals WHERE id = 1')).toMatch(/duplicate key/)
  })

  it('nothing is readable through the public API until sign-in adds rules', async () => {
    const api = localApi()
    for (const table of ['deals', 'events', 'reps']) {
      const res = await fetch(`${api.url}/rest/v1/${table}?select=*&limit=5`, { headers: { apikey: api.anonKey, Authorization: `Bearer ${api.anonKey}` } })
      const body = (await res.json()) as unknown
      // Either refused outright, or allowed to ask but shown no rows.
      expect(!res.ok || (Array.isArray(body) && body.length === 0), `${table}: ${res.status} ${JSON.stringify(body).slice(0, 80)}`).toBe(true)
    }
  })
})

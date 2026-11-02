// Who sees what in the live database (supabase/migrations/*_accounts.sql). Signs in
// as every person through the real API and checks the database agrees with
// src/data/access.ts, that reports run as the person asking, and that browsers
// can't write anything but their own usage events.
// Needs `npm run db:start` and `npm run db:reset` first.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { canSee } from '../../src/data/access'
import { PEOPLE, REPS, STORES } from '../../src/data/org'
import { runReport } from '../../src/db/database'
import { ALL_REPORTS } from '../../src/db/reports'
import { reportFunctionName } from '../../src/db/report-functions'
import { LOCAL_PASSWORD, connectLocal, localApi } from '../../scripts/local-db'
import { demoDatabase } from '../sqljs'

const api = localApi()
let db: pg.Client
const tokens = new Map<string, string>()

beforeAll(async () => {
  db = await connectLocal()
  for (const p of PEOPLE) {
    const res = await fetch(`${api.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: api.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: p.email, password: LOCAL_PASSWORD }),
    })
    const body = (await res.json()) as { access_token?: string }
    if (!body.access_token) throw new Error(`${p.email} couldn't sign in`)
    tokens.set(p.id, body.access_token)
  }
})
afterAll(async () => {
  await db?.end()
})

const headers = (who: string | null) => ({ apikey: api.anonKey, Authorization: `Bearer ${who ? tokens.get(who) : api.anonKey}` })

/** How many rows of a table someone can read through the API (`filter` like 'rep_id=eq.tasha'). */
async function visible(who: string | null, table: string, filter = ''): Promise<number> {
  const res = await fetch(`${api.url}/rest/v1/${table}?select=*${filter ? `&${filter}` : ''}`, {
    headers: { ...headers(who), Prefer: 'count=exact', Range: '0-0' },
  })
  if (!res.ok && res.status !== 416) return -res.status // refused outright
  return Number(res.headers.get('content-range')?.split('/')[1] ?? 0)
}

async function report(who: string | null, id: string): Promise<{ status: number; rows: Record<string, unknown>[] }> {
  const res = await fetch(`${api.url}/rest/v1/rpc/${reportFunctionName(id)}`, { method: 'POST', headers: { ...headers(who), 'Content-Type': 'application/json' }, body: '{}' })
  return { status: res.status, rows: res.ok ? ((await res.json()) as Record<string, unknown>[]) : [] }
}

/** Runs SQL as a signed-in person, inside a transaction that's always undone. Returns 'ok' or the error. */
async function asPerson(id: string, sql: string): Promise<string> {
  const { rows } = await db.query('SELECT auth_user_id FROM profiles WHERE id = $1', [id])
  await db.query('BEGIN')
  try {
    await db.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: rows[0].auth_user_id, role: 'authenticated' })])
    await db.query('SET LOCAL ROLE authenticated')
    await db.query(sql)
    return 'ok'
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  } finally {
    await db.query('ROLLBACK')
  }
}

/** Rows per rep and store, as the database owner sees them (no rules). */
async function perRep(sql: string): Promise<{ repId: string; storeId: string; n: number }[]> {
  const { rows } = await db.query(sql)
  return rows.map((r) => ({ repId: r.rep_id, storeId: r.store_id, n: Number(r.n) }))
}

const OWNED: Record<string, string> = {
  visits: 'SELECT rep_id, store_id, COUNT(*) AS n FROM visits GROUP BY 1, 2',
  deals: 'SELECT rep_id, store_id, COUNT(*) AS n FROM deals GROUP BY 1, 2',
  events: 'SELECT rep_id, store_id, COUNT(*) AS n FROM events GROUP BY 1, 2',
  traffic: 'SELECT rep_id, store_id, COUNT(*) AS n FROM traffic GROUP BY 1, 2',
  reps: 'SELECT id AS rep_id, store_id, COUNT(*) AS n FROM reps GROUP BY 1, 2',
  offers: 'SELECT v.rep_id, v.store_id, COUNT(*) AS n FROM offers o JOIN visits v ON v.id = o.visit_id GROUP BY 1, 2',
  offer_lines: 'SELECT v.rep_id, v.store_id, COUNT(*) AS n FROM offer_lines l JOIN offers o ON o.id = l.offer_id JOIN visits v ON v.id = o.visit_id GROUP BY 1, 2',
  offer_reasons: 'SELECT v.rep_id, v.store_id, COUNT(*) AS n FROM offer_reasons x JOIN offers o ON o.id = x.offer_id JOIN visits v ON v.id = o.visit_id GROUP BY 1, 2',
  deal_lines: 'SELECT d.rep_id, d.store_id, COUNT(*) AS n FROM deal_lines l JOIN deals d ON d.id = l.deal_id GROUP BY 1, 2',
  offer_facts: 'SELECT rep_id, store_id, COUNT(*) AS n FROM offer_facts GROUP BY 1, 2',
}

describe('every person reads exactly what access.ts allows', () => {
  it.each(Object.keys(OWNED))('%s', async (table) => {
    const groups = await perRep(OWNED[table])
    for (const p of PEOPLE) {
      const want = groups.filter((g) => canSee(p, g)).reduce((s, g) => s + g.n, 0)
      expect(await visible(p.id, table), `${p.id} reading ${table}`).toBe(want)
    }
  })

  it('rep by rep: each person sees a rep’s customers and usage events only when allowed', async () => {
    const visits = await perRep(OWNED.visits)
    for (const p of PEOPLE) {
      for (const r of REPS) {
        const g = visits.find((v) => v.repId === r.id)!
        expect(await visible(p.id, 'visits', `rep_id=eq.${r.id}`), `${p.id} → ${r.id}`).toBe(canSee(p, g) ? g.n : 0)
      }
    }
  })

  it('everyone signed in reads the catalog, the rules and the stores; Owen (turned off) reads nothing', async () => {
    const products = Number((await db.query('SELECT COUNT(*) AS n FROM products')).rows[0].n)
    for (const p of PEOPLE) {
      const on = p.status === 'active'
      expect(await visible(p.id, 'products'), p.id).toBe(on ? products : 0)
      expect(await visible(p.id, 'settings_history'), p.id).toBe(on ? 1 : 0)
      expect(await visible(p.id, 'stores'), p.id).toBe(on ? STORES.length : 0)
    }
  })

  it('people: yourself, your store’s people (managers), everyone (admins)', async () => {
    expect(await visible('kevin', 'profiles')).toBe(1)
    expect(await visible('lena', 'profiles')).toBe(5)
    expect(await visible('marisol', 'profiles')).toBe(5)
    expect(await visible('dana', 'profiles')).toBe(PEOPLE.length)
    expect(await visible('owen', 'profiles')).toBe(0)
  })

  it('signed out (the public key alone), nothing can be read at all', async () => {
    for (const table of ['visits', 'deals', 'products', 'profiles', 'events', 'stores']) {
      expect(await visible(null, table), table).toBeLessThanOrEqual(0)
    }
  })
})

describe('reports run as the person asking', () => {
  const names = (store: string) => REPS.filter((r) => r.storeId === store).map((r) => r.name)

  it.each(ALL_REPORTS.map((r) => r.id))('%s: the owner gets the whole company, the same as the browser demo', async (id) => {
    const { db: demo } = await demoDatabase()
    const lite = runReport(demo, id)
    const { status, rows } = await report('dana', id)
    expect(status).toBe(200)
    expect(rows.length).toBe(lite.rows.length)
    if (rows.length) expect(Object.keys(rows[0])).toEqual(lite.columns)
    rows.forEach((row, i) =>
      lite.columns.forEach((c, j) => {
        const want = lite.rows[i][j]
        const got = row[c]
        if (typeof want === 'number') expect(Math.abs(Number(got) - want), `${c} row ${i + 1}`).toBeLessThanOrEqual(0.01 + 1e-9)
        else expect(got, `${c} row ${i + 1}`).toEqual(want)
      }),
    )
  })

  it.each(ALL_REPORTS.map((r) => r.id))('%s: a store manager only gets their store', async (id) => {
    for (const [manager, store] of [['lena', 'riverside'], ['marisol', 'hillcrest']]) {
      const { status, rows } = await report(manager, id)
      expect(status).toBe(200)
      for (const row of rows) {
        if ('rep' in row) expect(names(store), `${manager}: ${String(row.rep)}`).toContain(row.rep)
        if ('store' in row) expect(row.store).toBe(STORES.find((s) => s.id === store)!.name)
      }
    }
  })

  it('a store manager’s company-wide numbers are their store’s numbers', async () => {
    const { rows } = await report('lena', 'usage-company-by-month')
    const riverside = Number((await db.query("SELECT SUM(ups) AS n FROM traffic WHERE store_id = 'riverside'")).rows[0].n)
    expect(rows.reduce((s, r) => s + Number(r.customers), 0)).toBe(riverside)
  })

  it('a rep only gets themselves; Owen gets nothing; signed out is refused', async () => {
    const tasha = await report('tasha', 'rep-scorecard')
    expect(new Set(tasha.rows.map((r) => r.rep))).toEqual(new Set(['Tasha Ortiz']))
    for (const r of ALL_REPORTS) expect((await report('owen', r.id)).rows, r.id).toEqual([])
    expect((await report(null, 'rep-scorecard')).status).toBeGreaterThanOrEqual(400)
  })
})

describe('browsers write nothing but their own usage events', () => {
  const event = (rep: string, store: string) =>
    `INSERT INTO events (at, rep_id, store_id, session_id, type) VALUES ('2026-11-02 10:00', '${rep}', '${store}', 's-test', 'session_started')`

  it('a rep adds their own usage events, never someone else’s', async () => {
    expect(await asPerson('tasha', event('tasha', 'riverside'))).toBe('ok')
    expect(await asPerson('tasha', event('kevin', 'riverside'))).toMatch(/row-level security/)
    expect(await asPerson('tasha', event('tasha', 'hillcrest'))).toMatch(/row-level security/)
    expect(await asPerson('lena', event('tasha', 'riverside'))).toMatch(/row-level security/)
    expect(await asPerson('owen', event('ben', 'hillcrest'))).toMatch(/row-level security/)
  })

  it('nobody signed in can save a sale, change the catalog or rules, or touch a profile directly', async () => {
    for (const who of ['tasha', 'lena', 'dana']) {
      expect(await asPerson(who, "INSERT INTO visits (rep_id, store_id, visited_on, sold) VALUES ('tasha', 'riverside', '2026-11-02', true)"), who).toMatch(/permission denied/)
      expect(await asPerson(who, 'UPDATE products SET list_cents = 1'), who).toMatch(/permission denied/)
      expect(await asPerson(who, "INSERT INTO settings_history (changed_on, settings_json) VALUES (now(), '{}')"), who).toMatch(/permission denied/)
      expect(await asPerson(who, "UPDATE profiles SET role = 'admin'"), who).toMatch(/permission denied/)
      expect(await asPerson(who, "UPDATE events SET how = 'x' WHERE id = 1"), who).toMatch(/permission denied/)
    }
  })

  it('people are never deleted, not even by the database owner', async () => {
    await db.query('BEGIN')
    try {
      await expect(db.query("DELETE FROM profiles WHERE id = 'owen'")).rejects.toThrow(/never deleted/)
    } finally {
      await db.query('ROLLBACK')
    }
  })
})

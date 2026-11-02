import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runReadOnlyQuery, runReport } from '../src/db/database'
import type { QueryResult } from '../src/db/database'
import { ALL_REPORTS, postgresFile, postgresSql } from '../src/db/reports'
import { REPS } from '../src/data/org'
import { DEFAULT_SETTINGS } from '../src/data/settings'
import { marginBp } from '../src/engine'
import { demoDatabase } from './sqljs'

/** A report's rows as objects keyed by column name. */
async function report(id: string): Promise<Record<string, unknown>[]> {
  const { db } = await demoDatabase()
  const res: QueryResult = runReport(db, id)
  return res.rows.map((row) => Object.fromEntries(res.columns.map((c, i) => [c, row[i]])))
}

const pct = (part: number, whole: number) => Math.round((1000 * part) / whole) / 10
const sum = <T>(items: T[], f: (x: T) => number) => items.reduce((s, x) => s + f(x), 0)
const name = (repId: string) => REPS.find((r) => r.id === repId)!.name

describe('every report', () => {
  it.each(ALL_REPORTS.map((r) => r.id))('%s runs and returns rows', async (id) => {
    const rows = await report(id)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) for (const v of Object.values(row)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
  })

  it.each(ALL_REPORTS.map((r) => r.file))('%s starts with a plain-English header', (file) => {
    const text = readFileSync(join(import.meta.dirname, '../src/db/queries', file), 'utf8')
    expect(text.startsWith('-- ')).toBe(true)
    expect(text).toMatch(/-- Question:/)
    expect(text).toMatch(/-- SQL ideas:/)
  })

  it('has unique ids', () => {
    expect(new Set(ALL_REPORTS.map((r) => r.id)).size).toBe(ALL_REPORTS.length)
  })
})

describe('rep scorecard, checked against the raw history', () => {
  it('matches ups, orders, conversion and commission for every rep and month', async () => {
    const { summary } = await demoDatabase()
    const rows = await report('rep-scorecard')
    expect(rows.length).toBe(7 * 6)
    for (const row of rows) {
      const repId = REPS.find((r) => r.name === row.rep)!.id
      const inMonth = (d: string) => d.startsWith(row.month as string)
      const visits = summary.visits.filter((v) => v.repId === repId && inMonth(v.date))
      const deals = summary.deals.filter((d) => d.repId === repId && inMonth(d.date))
      expect(row.ups).toBe(visits.length)
      expect(row.orders).toBe(deals.length)
      expect(row.conversion_pct).toBeCloseTo(pct(deals.length, visits.length), 1)
      expect(row.commission).toBeCloseTo(sum(deals, (d) => d.commissionCents) / 100, 2)
      expect(row.topline).toBeCloseTo(sum(deals, (d) => d.toplineCents) / 100, 2)
      expect(row.base_attach_pct).toBeCloseTo(pct(deals.filter((d) => d.attach).length, deals.length), 1)
    }
  })
})

describe('the other reports add up', () => {
  it('store comparison: the two stores add up to the whole company', async () => {
    const { summary } = await demoDatabase()
    const rows = await report('store-comparison')
    expect(rows).toHaveLength(2)
    expect(sum(rows, (r) => r.orders as number)).toBe(summary.deals.length)
    expect(sum(rows, (r) => r.ups as number)).toBe(summary.visits.length)
    expect(sum(rows, (r) => r.reps as number)).toBe(7)
  })

  it('tier mix: each rep adds up to 100%', async () => {
    for (const row of await report('tier-mix')) {
      expect((row.top_pct as number) + (row.middle_pct as number) + (row.low_pct as number)).toBeCloseTo(100, 0)
    }
  })

  it('where deals close: shares add to 100% and each step down earns less', async () => {
    const { summary } = await demoDatabase()
    const rows = await report('where-deals-close')
    expect(sum(rows, (r) => r.deals as number)).toBe(summary.deals.length)
    expect(sum(rows, (r) => r.share_pct as number)).toBeCloseTo(100, 0)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].avg_margin_pct as number).toBeLessThan(rows[i - 1].avg_margin_pct as number)
    }
  })

  it('attach trend: one row per month, first month has no change', async () => {
    const { summary } = await demoDatabase()
    const rows = await report('attach-trend')
    expect(rows.map((r) => r.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
    expect(rows[0].change_pts).toBeNull()
    expect(sum(rows, (r) => r.base_orders as number)).toBe(summary.deals.filter((d) => d.attach).length)
  })

  it('exceptions: sales under the exceptions margin match the history', async () => {
    const { summary } = await demoDatabase()
    const rows = await report('exceptions')
    const final = DEFAULT_SETTINGS.exceptionMarginBp
    // margin_bp is stored rounded down, the same way marginBp works it out.
    const under = summary.deals.filter((d) => marginBp(d.grossCents, d.toplineCents) < final)
    expect(sum(rows, (r) => r.under_margin_sales as number)).toBe(under.length)
    expect(summary.underFinalSales.length).toBeGreaterThan(0)
    expect(under.length).toBeGreaterThanOrEqual(summary.underFinalSales.length)
  })
})

describe('the reps tell their story', () => {
  async function byRep(id: string, column: string) {
    const rows = await report(id)
    return Object.fromEntries(rows.map((r) => [r.rep as string, r[column] as number]))
  }
  const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0][0]

  it('Tasha attaches the most bases and keeps the most sales in the top tier', async () => {
    const { summary } = await demoDatabase()
    const attach = Object.fromEntries(
      REPS.map((r) => {
        const deals = summary.deals.filter((d) => d.repId === r.id)
        return [r.name, pct(deals.filter((d) => d.attach).length, deals.length)]
      }),
    )
    expect(top(attach)).toBe(name('tasha'))
    expect(top(await byRep('tier-mix', 'top_pct'))).toBe(name('tasha'))
  })

  it('Kevin has the biggest low-tier share and the most sales under the final offer', async () => {
    expect(top(await byRep('tier-mix', 'low_pct'))).toBe(name('kevin'))
    expect(top(await byRep('exceptions', 'under_margin_sales'))).toBe(name('kevin'))
  })

  it('Marcus leads the premium line', async () => {
    expect(top(await byRep('premium-share', 'premium_share_pct'))).toBe(name('marcus'))
  })

  it('Renee converts the most customers; Ben has the biggest average order', async () => {
    const { summary } = await demoDatabase()
    const perRep = (f: (repId: string) => number) => Object.fromEntries(REPS.map((r) => [r.name, f(r.id)]))
    const conversion = perRep((id) =>
      pct(summary.deals.filter((d) => d.repId === id).length, summary.visits.filter((v) => v.repId === id).length),
    )
    const avgOrder = perRep((id) => {
      const deals = summary.deals.filter((d) => d.repId === id)
      return sum(deals, (d) => d.toplineCents) / deals.length
    })
    expect(top(conversion)).toBe(name('renee'))
    expect(top(avgOrder)).toBe(name('ben'))
  })

  it('Sofia, the new hire, converts and attaches more by the end', async () => {
    const rows = (await report('rep-scorecard')).filter((r) => r.rep === name('sofia'))
    const first = rows.slice(0, 2)
    const last = rows.slice(-2)
    const avg = (rs: typeof rows, c: string) => sum(rs, (r) => r[c] as number) / rs.length
    expect(avg(last, 'conversion_pct')).toBeGreaterThan(avg(first, 'conversion_pct') + 10)
    expect(avg(last, 'base_attach_pct')).toBeGreaterThan(avg(first, 'base_attach_pct'))
  })
})

describe('docs/SQL-GUIDE.md', () => {
  const guide = readFileSync(join(import.meta.dirname, '../docs/SQL-GUIDE.md'), 'utf8')

  it.each(ALL_REPORTS.map((r) => r.file))('shows the current query of %s, word for word', (file) => {
    const lines = readFileSync(join(import.meta.dirname, '../src/db/queries', file), 'utf8').split('\n')
    const firstCode = lines.findIndex((l) => !l.startsWith('--'))
    expect(guide).toContain(lines.slice(firstCode).join('\n').trim())
  })

  it('shows the offer_facts view word for word', () => {
    const schema = readFileSync(join(import.meta.dirname, '../src/db/schema.sql'), 'utf8')
    const start = schema.indexOf('CREATE VIEW offer_facts AS')
    expect(guide).toContain(schema.slice(start, schema.indexOf(';', start) + 1))
  })

  it('has query-lab examples that really run', async () => {
    const { db } = await demoDatabase()
    const part3 = guide.slice(guide.indexOf('## Part 3'))
    const block = [...part3.matchAll(/```sql\n([\s\S]*?)```/g)][0][1]
    const examples = block.split(/\n\n/).filter((s) => s.trim())
    expect(examples).toHaveLength(3)
    for (const sql of examples) expect(runReadOnlyQuery(db, sql).rows.length).toBeGreaterThan(0)
  })
})

describe('the Postgres versions (src/db/queries/postgres)', () => {
  const dir = join(import.meta.dirname, '../src/db/queries')
  const pgFiles = (sub = ''): string[] =>
    readdirSync(join(dir, 'postgres', sub), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? pgFiles(join(sub, e.name)) : [join(sub, e.name)],
    )

  it('each one replaces a real report, and is the one Postgres runs', () => {
    const files = pgFiles()
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const report = ALL_REPORTS.find((r) => r.file === f)
      expect(report, f).toBeDefined()
      expect(postgresFile(report!)).toBe(`postgres/${f}`)
      expect(postgresSql(report!)).toBe(readFileSync(join(dir, 'postgres', f), 'utf8'))
    }
  })

  it('each one keeps the plain-English header and says what differs', () => {
    for (const f of pgFiles()) {
      const text = readFileSync(join(dir, 'postgres', f), 'utf8')
      expect(text, f).toMatch(/^-- /)
      expect(text, f).toContain(`-- (Postgres version of src/db/queries/${f}.)`)
      expect(text, f).toMatch(/-- Postgres differences: /)
      expect(text, f).toMatch(/-- Question:/)
      expect(text, f).toMatch(/-- SQL ideas:/)
    }
  })

  it('reports without one run the same file on both databases', () => {
    for (const r of ALL_REPORTS) if (postgresFile(r) === r.file) expect(postgresSql(r)).toBe(r.sql)
  })
})

describe('the report functions for live mode (supabase/migrations/*_report_functions.sql)', () => {
  it('the latest migration matches the report files (run `npm run db:report-functions` after changing a report)', async () => {
    const { reportFunctionsSql } = await import('../src/db/report-functions')
    const dir = join(import.meta.dirname, '../supabase/migrations')
    const latest = readdirSync(dir).filter((f) => f.endsWith('_report_functions.sql')).sort().at(-1)
    expect(latest).toBeDefined()
    expect(readFileSync(join(dir, latest!), 'utf8')).toBe(reportFunctionsSql())
  })

  it('has one function per report, each running as the person asking and closed to the public key', async () => {
    const { reportFunctionsSql, reportFunctionName } = await import('../src/db/report-functions')
    const sql = reportFunctionsSql()
    for (const r of ALL_REPORTS) {
      const name = reportFunctionName(r.id)
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${name}() RETURNS SETOF json`)
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}() FROM PUBLIC, anon;`)
    }
    expect(sql.match(/SECURITY INVOKER/g)).toHaveLength(ALL_REPORTS.length)
    expect(sql).not.toMatch(/SECURITY DEFINER/)
  })
})

describe('docs/SQL-GUIDE.md Part 6 (the live database)', () => {
  it('every SQL example is still word for word in supabase/migrations (… marks a gap)', () => {
    const guide = readFileSync(join(import.meta.dirname, '../docs/SQL-GUIDE.md'), 'utf8')
    const part6 = guide.slice(guide.indexOf('## Part 6'))
    const dir = join(import.meta.dirname, '../supabase/migrations')
    const squash = (t: string) => t.replace(/\s+/g, ' ').trim()
    const migrations = squash(readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n'))
    const blocks = [...part6.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1])
    expect(blocks.length).toBeGreaterThanOrEqual(10)
    for (const b of blocks) {
      let from = 0
      for (const piece of b.split(/^…$/m).map(squash).filter(Boolean)) {
        const at = migrations.indexOf(piece, from)
        expect(at, piece.slice(0, 80)).toBeGreaterThanOrEqual(0)
        from = at + piece.length
      }
    }
  })
})

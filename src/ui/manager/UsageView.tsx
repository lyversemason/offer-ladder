import { useMemo } from 'react'
import { runReport } from '../../db/database'
import type { Database } from '../../db/database'
import { USAGE_REPORTS } from '../../db/reports'
import { Guide } from '../bits'
import { ReportBrowser } from './ReportBrowser'

type Row = Record<string, number | string | null>

/** '2026-09' → 'September'. */
function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' })
}

function pct(v: unknown): string {
  return typeof v === 'number' ? `${v.toFixed(1)}%` : '—'
}

/** The change from last month in percentage points, e.g. "+2.0 pts vs August". */
function change(now: unknown, before: unknown, beforeMonth: string): string | null {
  if (typeof now !== 'number' || typeof before !== 'number') return null
  const d = now - before
  return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(1)} pts vs ${monthName(beforeMonth)}`
}

function Tile({ label, value, note, delta }: { label: string; value: string; note: string; delta?: string | null }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
      <span className="small muted">{note}</span>
      {delta && <span className="small muted">{delta}</span>}
    </div>
  )
}

/**
 * The Usage tab (managers): is the app being used, and how. The tiles are the
 * latest month of the first usage report; the reports below are .sql files like
 * the sales reports.
 */
export function UsageView({ db, rev, guide }: { db: Database; rev: number; guide: boolean }) {
  const months = useMemo<Row[]>(() => {
    if (rev < 0) return []
    const res = runReport(db, 'usage-company-by-month')
    return res.rows.map((r) => Object.fromEntries(res.columns.map((c, i) => [c, r[i] as number | string | null])))
  }, [db, rev])
  const now = months.at(-1)
  const before = months.at(-2)

  return (
    <div className="reports">
      <Guide on={guide}>
        How the app itself is used, from its usage log: one row for each meaningful action (an item added, a price
        changed, an offer or outcome recorded), never keystrokes. <strong>Coverage</strong> compares tickets with the
        store's own count of customers, which comes from outside the app. The history's habits are planted: Tasha uses
        it with nearly everyone, Sofia (new) uses it more each month, Ben tries many prices and records few, Kevin
        leaves the most walk-outs unrecorded. Your own clicks in the rep view land here too.
      </Guide>
      {now && (
        <section className="tiles" aria-label={`${monthName(String(now.month))} at a glance`}>
          <Tile
            label="Coverage"
            value={pct(now.coverage_pct)}
            note={`of ${Number(now.customers).toLocaleString('en-US')} customers had a ticket in ${monthName(String(now.month))}`}
            delta={before && change(now.coverage_pct, before.coverage_pct, String(before.month))}
          />
          <Tile label="Reps using it" value={`${now.reps_using} of ${now.reps_on_floor}`} note="reps on the floor started a ticket" />
          <Tile
            label="Outcome recorded"
            value={pct(now.outcome_pct)}
            note="of tickets ended with Bought or Walked"
            delta={before && change(now.outcome_pct, before.outcome_pct, String(before.month))}
          />
          <Tile
            label="Dropped tickets"
            value={pct(now.dropped_pct)}
            note="left without an outcome (lower is better)"
            delta={before && change(now.dropped_pct, before.dropped_pct, String(before.month))}
          />
        </section>
      )}
      {now && (
        <p className="small muted tiles-note">
          {monthName(String(now.month))} is the latest month with a store count. Tickets from today show in the ticket,
          item and price reports, but not in coverage: the demo has no store count for today.
        </p>
      )}
      <ReportBrowser db={db} rev={rev} reports={USAGE_REPORTS} label="Usage reports" />
    </div>
  )
}

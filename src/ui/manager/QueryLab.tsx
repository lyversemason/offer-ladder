import { useState } from 'react'
import { runReadOnlyQuery } from '../../db/database'
import type { Database, QueryResult } from '../../db/database'
import { Guide } from '../bits'
import { ResultTable } from './ResultTable'

const EXAMPLES = [
  {
    label: '10 biggest sales',
    sql: `SELECT closed_on, rep_id, topline_cents / 100.0 AS price, tier_id
FROM deals
ORDER BY topline_cents DESC
LIMIT 10`,
  },
  {
    label: 'Best-selling mattresses',
    sql: `SELECT p.brand, p.model, SUM(dl.qty) AS units
FROM deal_lines dl
JOIN products p ON p.sku = dl.sku
WHERE p.category = 'mattress'
GROUP BY p.brand, p.model
ORDER BY units DESC`,
  },
  {
    label: 'Financing terms used',
    sql: `SELECT financing_months, COUNT(*) AS sales
FROM deals
GROUP BY financing_months
ORDER BY sales DESC`,
  },
  {
    label: 'Usage: latest actions',
    sql: `SELECT at, rep_id, type, how, scope, sku, value
FROM events
ORDER BY id DESC
LIMIT 50`,
  },
  {
    label: 'Usage: what reps do most',
    sql: `SELECT type, how, COUNT(*) AS times
FROM events
GROUP BY type, how
ORDER BY times DESC`,
  },
  {
    label: 'Offers line by line',
    sql: `SELECT o.visit_id, o.step_no, l.sku, l.net_cents / 100.0 AS offered,
       l.discount_how, l.discount_scope
FROM offers o
JOIN offer_lines l ON l.offer_id = o.id
ORDER BY o.id DESC, l.line_no
LIMIT 50`,
  },
  {
    label: 'The tables',
    sql: `SELECT name, sql
FROM sqlite_schema
WHERE type = 'table'
ORDER BY name`,
  },
]

export function QueryLab({ db, guide }: { db: Database; guide: boolean }) {
  const [sql, setSql] = useState(EXAMPLES[0].sql)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (text = sql) => {
    try {
      setResult(runReadOnlyQuery(db, text))
      setError(null)
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="lab">
      <Guide on={guide}>
        Ask the data your own question in SQL. Only reading is allowed: anything that would change the data (INSERT,
        UPDATE, DELETE, DROP…) is refused, and results stop at 500 rows. Start from an example and change it.
      </Guide>
      <section className="card">
        <div className="chips" role="group" aria-label="Examples">
          {EXAMPLES.map((e) => (
            <button
              key={e.label}
              type="button"
              className="chip"
              onClick={() => {
                setSql(e.sql)
                run(e.sql)
              }}
            >
              {e.label}
            </button>
          ))}
        </div>
        <label className="field-label" htmlFor="lab-sql" style={{ marginTop: 12 }}>Query</label>
        <textarea
          id="lab-sql"
          className="sql-editor"
          spellCheck={false}
          value={sql}
          rows={8}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run()
          }}
        />
        <div className="row">
          <button type="button" className="primary" onClick={() => run()}>Run query</button>
          <span className="small muted">Ctrl+Enter runs it too.</span>
        </div>
        {error && <p className="issue block" role="alert">{error}</p>}
        {result && (
          <>
            <p className="small muted">
              {result.rows.length} row{result.rows.length === 1 ? '' : 's'}
              {result.truncated ? ' (stopped at 500)' : ''}
            </p>
            <ResultTable result={result} bars={false} />
          </>
        )}
      </section>
    </div>
  )
}

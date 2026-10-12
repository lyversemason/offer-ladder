import { useMemo, useState } from 'react'
import { runReport } from '../../db/database'
import type { Database } from '../../db/database'
import { REPORTS } from '../../db/reports'
import { Guide } from '../bits'
import { ResultTable } from './ResultTable'

export function ReportsView({ db, rev, guide }: { db: Database; rev: number; guide: boolean }) {
  const [id, setId] = useState(REPORTS[0].id)
  const [showSql, setShowSql] = useState(false)
  const report = REPORTS.find((r) => r.id === id)!
  // rev changes whenever a deal is saved, so the report re-runs with it included.
  const result = useMemo(() => (rev >= 0 ? runReport(db, id) : null), [db, id, rev])

  return (
    <div className="reports">
      <Guide on={guide}>
        Every report here is a SQL query run against the deals the reps have recorded: six months of made-up history
        for 7 reps at 2 stores, plus anything you record in the rep view. Press <strong>Show the SQL</strong> to see the
        exact query; each one starts with a plain-English note on what it answers.
      </Guide>
      <div className="report-layout">
        <nav className="report-list" aria-label="Reports">
          {REPORTS.map((r, i) => (
            <button key={r.id} type="button" className={r.id === id ? 'on' : ''} aria-current={r.id === id ? 'page' : undefined} onClick={() => setId(r.id)}>
              <span className="muted small">{i + 1}</span> {r.title}
            </button>
          ))}
        </nav>
        <section className="card report">
          <div className="card-head">
            <div>
              <h2>{report.title}</h2>
              <p className="muted">{report.question}</p>
            </div>
            <button type="button" className="small-btn" aria-expanded={showSql} onClick={() => setShowSql(!showSql)}>
              {showSql ? 'Hide the SQL' : 'Show the SQL'}
            </button>
          </div>
          {showSql && (
            <pre className="sql" aria-label={`SQL for ${report.title}`}>
              <code>{report.sql.trim()}</code>
            </pre>
          )}
          {result && <ResultTable result={result} />}
          <p className="small muted">src/db/queries/{report.file}</p>
        </section>
      </div>
    </div>
  )
}

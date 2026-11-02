import { useState } from 'react'
import type { Report } from '../../db/reports'
import type { DataSource } from '../../source/types'
import { useReport } from '../reports'
import { ResultTable } from './ResultTable'

/**
 * A list of reports on the left, the chosen one on the right: its question, its
 * result, and its SQL on request. Used by the Reports and Usage tabs.
 */
export function ReportBrowser({ source, rev, reports, label }: { source: DataSource; rev: number; reports: Report[]; label: string }) {
  const [id, setId] = useState(reports[0].id)
  const [showSql, setShowSql] = useState(false)
  const report = reports.find((r) => r.id === id)!
  // rev changes whenever the database does, so the report re-runs with it included.
  const { result, error } = useReport(source, id, rev)

  return (
    <div className="report-layout">
      <nav className="report-list" aria-label={label}>
        {reports.map((r, i) => (
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
        {!result && !error && <p className="muted small" role="status">Running the report…</p>}
        {error && <p className="issue block">This report couldn't run: {error}</p>}
        <p className="small muted">src/db/queries/{report.file}</p>
      </section>
    </div>
  )
}

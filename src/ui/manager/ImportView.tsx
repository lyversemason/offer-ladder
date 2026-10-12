import { useState } from 'react'
import type { Database, QueryResult } from '../../db/database'
import { IMPORT_STEPS, APPLY_STEP, applyChanges, loadVendorSheet, runCleaningSteps } from '../../import/pipeline'
import sampleSheet from '../../data/samples/vendor-cost-sheet.csv?raw'
import { Guide } from '../bits'
import { money, pct } from '../format'

interface Review {
  fileName: string
  rows: number
  issues: { row: number; item: string; level: string; problem: string }[]
  changes: { sku: string; model: string; size: string | null; change: string; oldList: number | null; newList: number; oldCost: number | null; newCost: number }[]
}

function query(db: Database, sql: string): QueryResult['rows'] {
  const res = db.exec(sql)
  return res.length ? res[0].values : []
}

function review(db: Database, fileName: string, rows: number): Review {
  return {
    fileName,
    rows,
    issues: query(db, 'SELECT row_no, item, level, problem FROM vendor_issues ORDER BY row_no').map(([row, item, level, problem]) => ({
      row: Number(row),
      item: item === null ? '' : String(item),
      level: String(level),
      problem: String(problem),
    })),
    changes: query(
      db,
      "SELECT sku, model, size, change, old_list_cents, new_list_cents, old_cost_cents, new_cost_cents FROM vendor_changes ORDER BY CASE change WHEN 'new' THEN 0 WHEN 'changed' THEN 1 ELSE 2 END, row_no",
    ).map(([sku, model, size, change, oldList, newList, oldCost, newCost]) => ({
      sku: String(sku),
      model: String(model),
      size: size === null ? null : String(size),
      change: String(change),
      oldList: oldList === null ? null : Number(oldList),
      newList: Number(newList),
      oldCost: oldCost === null ? null : Number(oldCost),
      newCost: Number(newCost),
    })),
  }
}

const margin = (list: number, cost: number) => pct(Math.floor(((list - cost) * 10000) / list))

export function ImportView({ db, onApplied, guide }: { db: Database; onApplied: () => void; guide: boolean }) {
  const [state, setState] = useState<Review | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<{ changed: number; added: number } | null>(null)
  const [openStep, setOpenStep] = useState<string | null>(null)

  const start = (text: string, fileName: string) => {
    setApplied(null)
    try {
      const loaded = loadVendorSheet(db, text)
      if (loaded.missingColumns.length) {
        setState(null)
        setError(`This file is missing columns: ${loaded.missingColumns.join(', ')}. It needs at least Product, Size, Cost, Retail and Item #.`)
        return
      }
      runCleaningSteps(db)
      setError(null)
      setState(review(db, fileName, loaded.rows))
    } catch (e) {
      setState(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const counts = state && {
    skipped: state.issues.filter((i) => i.level === 'skip').length,
    blocked: new Set(state.issues.filter((i) => i.level === 'block').map((i) => i.row)).size,
    warned: state.issues.filter((i) => i.level === 'warn').length,
    added: state.changes.filter((c) => c.change === 'new').length,
    changed: state.changes.filter((c) => c.change === 'changed').length,
    same: state.changes.filter((c) => c.change === 'same').length,
  }

  return (
    <div className="import">
      <Guide on={guide}>
        A vendor sends a cost sheet as a messy spreadsheet export. The sample has the usual problems: merged cells
        left blank, sizes written five ways, money as text, a repeated header, a duplicate, a "do not use" row and a
        few real mistakes. SQL cleans it in numbered steps, flags what a person must check, and changes nothing in the
        catalog until you approve.
      </Guide>
      <section className="card">
        <h2>Import a vendor cost sheet</h2>
        <div className="row">
          <button type="button" className="primary" onClick={() => start(sampleSheet, 'vendor-cost-sheet.csv (sample)')}>Use the sample sheet</button>
          <label className="file-btn">
            Upload a CSV…
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) start(await f.text(), f.name)
                e.target.value = ''
              }}
            />
          </label>
          <a className="small" href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleSheet)}`} download="vendor-cost-sheet.csv">Download the sample</a>
        </div>
        {error && <p className="issue block" role="alert">{error}</p>}

        <details className="steps">
          <summary>The cleaning steps (SQL)</summary>
          <ol>
            {[...IMPORT_STEPS, APPLY_STEP].map((s) => (
              <li key={s.id}>
                <button type="button" className="link" aria-expanded={openStep === s.id} onClick={() => setOpenStep(openStep === s.id ? null : s.id)}>
                  {s.title}
                </button>
                {openStep === s.id && (
                  <pre className="sql"><code>{s.sql.trim()}</code></pre>
                )}
              </li>
            ))}
          </ol>
        </details>
      </section>

      {state && counts && (
        <>
          <section className="card">
            <h2>Review: {state.fileName}</h2>
            <dl className="numbers">
              <div><dt>Rows read</dt><dd>{state.rows}</dd></div>
              <div><dt>Not data (skipped)</dt><dd>{counts.skipped}</dd></div>
              <div><dt>Need fixing</dt><dd className={counts.blocked ? 'neg' : ''}>{counts.blocked}</dd></div>
              <div><dt>Warnings</dt><dd>{counts.warned}</dd></div>
              <div><dt>New items</dt><dd>{counts.added}</dd></div>
              <div><dt>Price or cost changes</dt><dd>{counts.changed}</dd></div>
              <div><dt>No change</dt><dd>{counts.same}</dd></div>
            </dl>
          </section>

          {state.issues.length > 0 && (
            <section className="card">
              <h2>Rows to look at</h2>
              <div className="table-scroll">
                <table className="grid data">
                  <thead><tr><th>Row</th><th>Item</th><th>What's wrong</th></tr></thead>
                  <tbody>
                    {state.issues.map((i, k) => (
                      <tr key={k} className={`issue-row ${i.level}`}>
                        <td className="num">{i.row}</td>
                        <td>{i.item || '—'}</td>
                        <td><span className={`lvl lvl-${i.level}`}>{i.level === 'block' ? 'Fix' : i.level === 'warn' ? 'Check' : 'Skipped'}</span> {i.problem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card">
            <h2>Changes to the catalog</h2>
            <p className="small muted">Rows marked "Fix" are left out. Fix them in the sheet and import it again.</p>
            <div className="table-scroll">
              <table className="grid data">
                <thead><tr><th>Item</th><th>Product</th><th>Change</th><th className="num">Retail</th><th className="num">Cost</th><th className="num">Margin</th></tr></thead>
                <tbody>
                  {state.changes.filter((c) => c.change !== 'same').map((c) => (
                    <tr key={c.sku}>
                      <td>{c.sku}</td>
                      <td>{c.model}{c.size ? ` (${c.size})` : ''}</td>
                      <td><span className={`lvl lvl-${c.change}`}>{c.change === 'new' ? 'New' : 'Changed'}</span></td>
                      <td className="num">{c.oldList !== null && c.oldList !== c.newList ? <><s className="muted">{money(c.oldList)}</s> </> : null}{money(c.newList)}</td>
                      <td className="num">{c.oldCost !== null && c.oldCost !== c.newCost ? <><s className="muted">{money(c.oldCost)}</s> </> : null}{money(c.newCost)}</td>
                      <td className="num">{margin(c.newList, c.newCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {applied ? (
              <p className="callout">Done: {applied.changed} item{applied.changed === 1 ? '' : 's'} updated and {applied.added} added. Reps can sell them now.</p>
            ) : (
              <div className="row">
                <button
                  type="button"
                  className="primary"
                  disabled={counts.added + counts.changed === 0}
                  onClick={() => {
                    setApplied(applyChanges(db))
                    onApplied()
                  }}
                >
                  Approve {counts.added + counts.changed} change{counts.added + counts.changed === 1 ? '' : 's'}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

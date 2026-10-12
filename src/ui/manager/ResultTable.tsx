import type { QueryResult } from '../../db/database'

/** Columns that hold dollars (the reports return them as plain numbers). */
const MONEY = new Set(['topline', 'avg_order', 'commission', 'avg_price', 'avg_commission', 'avg_add_ons', 'price'])

/** "base_attach_pct" → "Base attach %". */
function columnLabel(name: string): string {
  const words = name.replace(/_pct$/, ' %').replace(/_pts$/, ' (points)').replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function cell(name: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value !== 'number') return String(value)
  if (MONEY.has(name)) return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  if (name.endsWith('_pct')) return `${value.toFixed(1)}%`
  if (name.endsWith('_pts')) return `${value > 0 ? '+' : ''}${value.toFixed(1)}`
  return value.toLocaleString('en-US')
}

/**
 * A query result as a table. Percent columns get a faint bar so the eye can
 * compare rows; the numbers stay the main thing.
 */
export function ResultTable({ result, bars = true }: { result: QueryResult; bars?: boolean }) {
  const max: Record<number, number> = {}
  result.columns.forEach((c, i) => {
    if (bars && c.endsWith('_pct')) max[i] = Math.max(...result.rows.map((r) => (typeof r[i] === 'number' ? (r[i] as number) : 0)), 1)
  })
  return (
    <div className="table-scroll result">
      <table className="grid data">
        <thead>
          <tr>
            {result.columns.map((c) => (
              <th key={c} className={isNumeric(result, c) ? 'num' : ''}>{columnLabel(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((v, ci) => {
                const name = result.columns[ci]
                const pct = max[ci] !== undefined && typeof v === 'number' ? Math.max(0, (v / max[ci]) * 100) : null
                return (
                  <td key={ci} className={typeof v === 'number' ? 'num' : ''}>
                    {pct !== null ? (
                      <span className="bar-cell">
                        <span className="bar-track" aria-hidden>
                          <span className="bar" style={{ width: `${pct}%` }} />
                        </span>
                        <span>{cell(name, v)}</span>
                      </span>
                    ) : (
                      cell(name, v)
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 && <p className="muted small">No rows.</p>}
    </div>
  )
}

function isNumeric(result: QueryResult, column: string) {
  const i = result.columns.indexOf(column)
  return result.rows.some((r) => typeof r[i] === 'number')
}

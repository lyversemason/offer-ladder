import { useMemo } from 'react'
import { runReport } from '../../db/database'
import type { Database } from '../../db/database'
import { PATTERN_REPORTS } from '../../db/reports'
import { Guide } from '../bits'
import { ReportBrowser } from './ReportBrowser'

/** How much of the floor these reports can see, from the Usage tab's data quality report. */
function useSeen(db: Database, rev: number) {
  return useMemo(() => {
    if (rev < 0) return null
    const res = runReport(db, 'usage-data-quality')
    const col = (name: string) => res.columns.indexOf(name)
    const total = (name: string) => res.rows.reduce((s, r) => s + Number(r[col(name)] ?? 0), 0)
    const customers = total('customers')
    const recorded = total('recorded')
    return customers > 0 ? { customers, recorded, dropped: total('dropped') } : null
  }, [db, rev])
}

/**
 * The Deal patterns tab (managers only; reps never see odds or suggestions).
 * Every report is a .sql file; the warning and the data-quality line are always
 * shown, not only in the demo guide.
 */
export function PatternsView({ db, rev, guide }: { db: Database; rev: number; guide: boolean }) {
  const seen = useSeen(db, rev)
  return (
    <div className="reports">
      <Guide on={guide}>
        What happens with customers depending on what's offered: discount size, the adjustable base, free delivery,
        financing, second offers, and what discounting costs in commission. Managers only: reps never see odds or
        suggestions, so the app stays a tool, not an advisor. The demo's history has three customer patterns planted
        on purpose (free delivery on big tickets, 6-month financing, 15–35% off the base); see if you can find them.
      </Guide>
      <aside className="caution" aria-label="How to read these reports">
        <strong>Patterns, not proof.</strong> These reports show what happened alongside what, not what caused it. Reps
        give bigger discounts to customers who are already wavering, and customers who walk hear more offers than
        those who buy early. A real company settles a question like "does free delivery win big tickets?" with a
        controlled test.
        {seen && (
          <>
            {' '}They only see recorded customers: {seen.recorded.toLocaleString('en-US')} of the{' '}
            {seen.customers.toLocaleString('en-US')} the stores counted ({((100 * seen.recorded) / seen.customers).toFixed(1)}%), with{' '}
            {seen.dropped.toLocaleString('en-US')} tickets dropped without an outcome (Usage → Data quality has it by rep).
          </>
        )}
      </aside>
      <ReportBrowser db={db} rev={rev} reports={PATTERN_REPORTS} label="Deal pattern reports" />
    </div>
  )
}

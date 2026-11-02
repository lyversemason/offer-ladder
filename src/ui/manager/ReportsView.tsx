import type { Database } from '../../db/database'
import { REPORTS } from '../../db/reports'
import { Guide } from '../bits'
import { ReportBrowser } from './ReportBrowser'

export function ReportsView({ db, rev, guide }: { db: Database; rev: number; guide: boolean }) {
  return (
    <div className="reports">
      <Guide on={guide}>
        Every report here is a SQL query run against the deals the reps have recorded: six months of made-up history
        for 7 reps at 2 stores, plus anything you record in the rep view. Press <strong>Show the SQL</strong> to see the
        exact query; each one starts with a plain-English note on what it answers.
      </Guide>
      <ReportBrowser db={db} rev={rev} reports={REPORTS} label="Reports" />
    </div>
  )
}

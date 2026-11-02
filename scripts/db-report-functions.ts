// Writes the report functions migration when the reports have changed. A new
// file each time (migrations that already ran are never edited); nothing is
// written when the latest one is already up to date.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { reportFunctionsSql } from '../src/db/report-functions'

const dir = join(import.meta.dirname, '../supabase/migrations')
const latest = readdirSync(dir).filter((f) => f.endsWith('_report_functions.sql')).sort().at(-1)
const sql = reportFunctionsSql()
if (latest && readFileSync(join(dir, latest), 'utf8') === sql) {
  console.log(`Up to date: supabase/migrations/${latest}`)
} else {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`
  const file = `${stamp}_report_functions.sql`
  writeFileSync(join(dir, file), sql)
  console.log(`Wrote supabase/migrations/${file}. Apply it with \`npm run db:reset\`.`)
}

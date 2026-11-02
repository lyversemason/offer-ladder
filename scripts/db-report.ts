// Runs one report on the local Postgres database and prints it as a table.
//   npm run db:report                  lists the reports
//   npm run db:report rep-scorecard    runs one (its Postgres version, if it has one)
import { ALL_REPORTS, postgresFile, postgresSql } from '../src/db/reports'
import { connectLocal } from './local-db'

async function main() {
  const id = process.argv[2]
  const report = ALL_REPORTS.find((r) => r.id === id)
  if (!report) {
    console.log(id ? `No report called "${id}". The reports:\n` : 'The reports:\n')
    for (const r of ALL_REPORTS) console.log(`  ${r.id.padEnd(26)} ${r.title}`)
    return
  }
  const db = await connectLocal()
  try {
    const res = await db.query(postgresSql(report))
    console.log(`${report.title}\n${report.question}\n(src/db/queries/${postgresFile(report)}, on Postgres)\n`)
    console.table(res.rows)
  } finally {
    await db.end()
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

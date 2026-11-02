// Fills the local Postgres database with the demo: stores, reps, catalog, rules
// and the six months of made-up history. It builds the history exactly as the
// browser demo does (same code, same random seed, so the same rows), then copies
// every table across. Run by `npm run db:reset`, which first empties the database.
import initSqlJs from 'sql.js'
import { buildDemoDatabase } from '../src/data/history'
import { TABLE_ORDER, connectLocal } from './local-db'

const BATCH = 2000

async function main() {
  const SQL = await initSqlJs()
  const { db: demo, summary } = buildDemoDatabase(SQL)
  const pg = await connectLocal()
  try {
    const { rows } = await pg.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM stores')
    if (rows[0].n > 0) throw new Error('The local database already has data. Run `npm run db:reset` to empty and refill it.')

    await pg.query('BEGIN')
    for (const table of TABLE_ORDER) {
      // Postgres's column types decide how each SQLite value is carried over.
      const cols = await pg.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      )
      const type = Object.fromEntries(cols.rows.map((c) => [c.column_name, c.data_type]))
      const res = demo.exec(`SELECT * FROM ${table}`)[0]
      const all = (res?.values ?? []).map((values) =>
        Object.fromEntries(
          res.columns.map((c, i) => {
            const v = values[i]
            if (!(c in type)) throw new Error(`${table}.${c} is in the demo but not in the Postgres tables`)
            if (v === null) return [c, null]
            if (type[c] === 'boolean') return [c, v === 1]
            if (type[c] === 'jsonb') return [c, JSON.parse(String(v))]
            return [c, v]
          }),
        ),
      )
      for (let i = 0; i < all.length; i += BATCH) {
        // One JSON list per batch; Postgres turns each object into a row of the table's types.
        await pg.query(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, $1)`, [JSON.stringify(all.slice(i, i + BATCH))])
      }
      if (type.id === 'bigint') {
        // The next id handed out continues after the copied ones.
        await pg.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT MAX(id) FROM ${table}))`)
      }
      console.log(`${table.padEnd(17)} ${all.length.toLocaleString('en-US').padStart(7)} rows`)
    }
    await pg.query('COMMIT')
    console.log(`Done: ${summary.visits.length.toLocaleString('en-US')} recorded customers, ${summary.deals.length.toLocaleString('en-US')} sales.`)
  } catch (e) {
    await pg.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await pg.end()
    demo.close()
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

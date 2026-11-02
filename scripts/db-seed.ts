// Fills the local Postgres database with the demo: stores, reps, catalog, rules
// and the six months of made-up history. It builds the history exactly as the
// browser demo does (same code, same random seed, so the same rows), then copies
// every table across. Run by `npm run db:reset`, which first empties the database.
import initSqlJs from 'sql.js'
import { buildDemoDatabase } from '../src/data/history'
import { PEOPLE } from '../src/data/org'
import { LOCAL_PASSWORD, TABLE_ORDER, connectLocal, localApi } from './local-db'

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
    await seedPeople(pg)
    // Fresh statistics, so Postgres plans the reports well straight away (it would
    // otherwise gather them in the background a minute or so later).
    await pg.query('ANALYZE')
    console.log(`Done: ${summary.visits.length.toLocaleString('en-US')} recorded customers, ${summary.deals.length.toLocaleString('en-US')} sales.`)
  } catch (e) {
    await pg.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await pg.end()
    demo.close()
  }
}

/**
 * One sign-in account per person (Supabase's admin API, local password) and their
 * profile. Managers were invited by the owner, reps by their store's manager;
 * Owen's access was turned off by the owner when Marisol took over Hillcrest.
 */
async function seedPeople(pg: Awaited<ReturnType<typeof connectLocal>>) {
  const api = localApi()
  const managerOf = (store: string | null) => PEOPLE.find((p) => p.role === 'manager' && p.status === 'active' && p.storeId === store)?.id ?? null
  for (const person of PEOPLE) {
    const res = await fetch(`${api.url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: api.serviceKey, Authorization: `Bearer ${api.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: person.email, password: LOCAL_PASSWORD, email_confirm: true }),
    })
    const user = (await res.json()) as { id?: string; msg?: string }
    if (!res.ok || !user.id) throw new Error(`Couldn't create the sign-in for ${person.email}: ${user.msg ?? res.status}`)
    const invitedBy = person.role === 'admin' ? null : person.role === 'manager' ? 'dana' : managerOf(person.storeId)
    await pg.query(
      `INSERT INTO profiles (id, auth_user_id, name, email, role, store_id, rep_id, status, invited_by, invited_at, activated_at, turned_off_at, turned_off_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '2026-03-02 09:00-05', '2026-03-02 10:00-05', $10, $11)`,
      [person.id, user.id, person.name, person.email, person.role, person.storeId, person.repId, person.status, invitedBy,
       person.status === 'off' ? '2026-03-30 17:00-04' : null, person.status === 'off' ? 'dana' : null],
    )
  }
  console.log(`${'profiles'.padEnd(17)} ${String(PEOPLE.length).padStart(7)} people, each with a local sign-in`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

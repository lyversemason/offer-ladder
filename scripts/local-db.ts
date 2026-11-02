// Connecting to OfferLadder's local Postgres (the local Supabase in Docker,
// started with `npm run db:start`). Local only: the password is the Supabase
// CLI's fixed development password, and the address must be this computer.
import { execFileSync } from 'node:child_process'
import pg from 'pg'

/** Every table, parents before children, so every reference points at a row that's already there. */
export const TABLE_ORDER = [
  'stores', 'reps', 'products', 'settings_history', 'visits', 'deals', 'deal_lines',
  'offers', 'offer_lines', 'offer_reasons', 'events', 'traffic',
] as const

/** The local database's address (port 55322, set in supabase/config.toml). */
export const LOCAL_DB_URL = process.env.OFFERLADDER_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres'

/** A connection to the local database, or a plain-English error if it isn't running. */
export async function connectLocal(): Promise<pg.Client> {
  const host = new URL(LOCAL_DB_URL).hostname
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Refusing to use a database that isn't on this computer: ${host}`)
  const client = new pg.Client({ connectionString: LOCAL_DB_URL })
  try {
    await client.connect()
  } catch {
    throw new Error('The local database is not running. Start it with `npm run db:start`.')
  }
  // Report numbers come back as numbers, not text (Postgres sends exact decimals as text).
  client.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v))
  client.setTypeParser(pg.types.builtins.INT8, (v) => Number(v))
  // Dates and times stay as written ('2026-04-17'), not converted to the computer's time zone.
  client.setTypeParser(pg.types.builtins.DATE, (v) => v)
  client.setTypeParser(pg.types.builtins.TIMESTAMP, (v) => v)
  return client
}

/** Every local sign-in account uses this password. Local only: never used outside this computer. */
export const LOCAL_PASSWORD = 'local-only-password'

/**
 * The local API's address, its public (anonymous) key and its service key (full
 * access, for seeding and test setup only), read from `supabase status`.
 */
export function localApi(): { url: string; anonKey: string; serviceKey: string } {
  let out: string
  try {
    out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    throw new Error('The local database is not running. Start it with `npm run db:start`.')
  }
  const s = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>
  const url = s.API_URL
  const anonKey = s.ANON_KEY ?? s.PUBLISHABLE_KEY
  const serviceKey = s.SERVICE_ROLE_KEY ?? s.SECRET_KEY
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url ?? '')) throw new Error(`Refusing to use an API that isn't on this computer: ${url}`)
  return { url, anonKey, serviceKey }
}

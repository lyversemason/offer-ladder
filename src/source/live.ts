// Live mode: the shared Postgres database (Supabase), read through its access
// rules. Who you are comes from your sign-in: an email with a link, or the
// 6-digit code in the same email (for phones where the link opens in a different
// browser). No passwords, no sign-up: only invited people have an account.
//
// Reading goes straight to the database, through its access rules. Reps' usage
// events are added directly (the database lets a rep add their own). Every other
// change goes to the server function (server/save.ts), which checks who's asking,
// prices a sale again with the engine and writes it in one transaction.
import type { Database } from 'sql.js'
import { createClient } from '@supabase/supabase-js'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Product, Settings } from '../engine'
import type { Person, Role, Status } from '../data/access'
import { DEFAULT_SETTINGS } from '../data/settings'
import { productFromRow } from '../db/database'
import type { ProductRow, QueryResult } from '../db/database'
import { reportFunctionName } from '../db/report-functions'
import type { DataSource } from './types'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  /** Signed in, but not allowed in: access turned off, not set up yet, or no account behind the email. */
  | { status: 'no-access'; email: string; reason: 'off' | 'invited' | 'unknown' }
  | { status: 'ready'; person: Person }

export interface LiveAuth {
  get(): AuthState
  subscribe(listener: () => void): () => void
  /** Emails a sign-in link and code. Only people with an account get one: there is no sign-up. */
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
}

export interface Live {
  source: DataSource
  auth: LiveAuth
  /** For tests. */
  client: SupabaseClient
}

export const SERVER_DOWN_MESSAGE = "Couldn't reach the server. Nothing was saved; try again."
export const DEMO_ONLY_MESSAGE = 'The query lab is only in the demo. In live mode, use the reports.'

interface ProfileRow {
  id: string
  name: string
  email: string
  role: Role
  store_id: string | null
  rep_id: string | null
  status: Status
}

export const personFromRow = (r: ProfileRow): Person => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  storeId: r.store_id,
  repId: r.rep_id,
  status: r.status,
})

/** A report function's rows (JSON objects, columns in the report's order) as the table the screens show. */
export function toQueryResult(rows: Record<string, unknown>[]): QueryResult {
  const columns = rows.length ? Object.keys(rows[0]) : []
  return { columns, rows: rows.map((r) => columns.map((c) => (r[c] ?? null) as QueryResult['rows'][number][number])), truncated: false }
}

/** Sign-in errors in plain words. */
function plain(message: string): string {
  if (/signups not allowed|user not found/i.test(message)) return "That email doesn't have an OfferLadder account. Accounts are created by invitation."
  if (/expired|invalid/i.test(message)) return 'That code is wrong or has expired. Check the newest email, or send a new code.'
  if (/rate limit|seconds/i.test(message)) return 'Please wait a moment before asking for another code.'
  return message
}

export interface LiveOptions {
  /** In a browser (keeps the sign-in between visits); false in tests. */
  browser?: boolean
  /** A scratch database holding a copy of the catalog, for the catalog import's cleaning steps (sql.js). */
  workspace?: (products: Product[]) => Promise<Database>
}

export function createLive(url: string, anonKey: string, options: LiveOptions = {}): Live {
  const browser = options.browser ?? true
  const client = createClient(url, anonKey, {
    auth: {
      // The emailed link comes back with ?code=… (PKCE), which the client turns into a session.
      flowType: 'pkce',
      persistSession: browser,
      autoRefreshToken: browser,
      detectSessionInUrl: browser,
    },
  })

  let auth: AuthState = { status: 'loading' }
  const authListeners = new Set<() => void>()
  const setAuth = (next: AuthState) => {
    auth = next
    authListeners.forEach((l) => l())
  }

  /** Who the signed-in account belongs to. */
  async function load(session: Session | null) {
    if (!session) return setAuth({ status: 'signed-out' })
    const email = session.user.email ?? ''
    const { data, error } = await client.from('profiles').select('*').eq('auth_user_id', session.user.id).maybeSingle<ProfileRow>()
    if (error) throw new Error(`Couldn't load your account: ${error.message}`)
    if (!data) return setAuth({ status: 'no-access', email, reason: 'unknown' })
    if (data.status !== 'active') return setAuth({ status: 'no-access', email, reason: data.status })
    setAuth({ status: 'ready', person: personFromRow(data) })
  }

  client.auth.onAuthStateChange((event, session) => {
    // Token refreshes don't change who's signed in.
    if (event === 'TOKEN_REFRESHED') return
    // Run outside the callback: Supabase holds a lock while it runs.
    setTimeout(() => void load(session).catch((e: unknown) => console.error(e)), 0)
  })

  const listeners = new Set<() => void>()
  const changed = () => listeners.forEach((l) => l())

  /** Sends a change to the server function; a refusal comes back with the reason. */
  async function save<T>(action: string, args: unknown): Promise<T> {
    const { data, error } = await client.functions.invoke('save', { body: { action, args } })
    if (error) {
      // A refusal carries the server's reply; a network failure carries none.
      const context = (error as { context?: unknown }).context
      const body = context instanceof Response ? ((await context.json().catch(() => null)) as { error?: string } | null) : null
      throw new Error(body?.error ?? SERVER_DOWN_MESSAGE)
    }
    changed()
    return data as T
  }

  const source: DataSource = {
    mode: 'live',
    saving: true,

    async catalog() {
      const out: ProductRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from('products').select('*').order('sku').range(from, from + 999)
        if (error) throw new Error(`Couldn't load the catalog: ${error.message}`)
        out.push(...(data as ProductRow[]))
        if (data.length < 1000) return out.map(productFromRow)
      }
    },

    async settings() {
      const { data, error } = await client.from('settings_history').select('settings_json').order('id', { ascending: false }).limit(1).maybeSingle()
      if (error) throw new Error(`Couldn't load the rules: ${error.message}`)
      return (data?.settings_json as Settings | undefined) ?? DEFAULT_SETTINGS
    },

    async runReport(id) {
      const { data, error } = await client.rpc(reportFunctionName(id))
      if (error) throw new Error(error.message)
      return toQueryResult((data ?? []) as Record<string, unknown>[])
    },

    runQuery: async () => {
      throw new Error(DEMO_ONLY_MESSAGE)
    },

    async logEvents(events) {
      // Only reps' own events can be saved (the database checks); nothing else is logged.
      if (auth.status !== 'ready' || auth.person.role !== 'rep' || !events.length) return
      const rows = events.map((e) => ({
        at: e.at,
        rep_id: e.repId,
        store_id: e.storeId,
        session_id: e.sessionId,
        ticket_id: e.ticketId,
        type: e.type,
        how: e.how ?? null,
        scope: e.scope ?? null,
        sku: e.sku ?? null,
        value: e.value ?? null,
      }))
      const { error } = await client.from('events').insert(rows)
      if (error) throw new Error(`Usage event not saved: ${error.message}`)
    },

    recordOutcome: (outcome) => save('recordOutcome', outcome),
    saveSettings: async (settings) => {
      await save('saveSettings', settings)
    },
    async importWorkspace() {
      if (!options.workspace) throw new Error('The catalog import needs a browser.')
      return options.workspace(await source.catalog())
    },
    async applyImport(ws) {
      // Only the approved list leaves the browser; the server checks it and applies step 6.
      const res = ws.exec(
        `SELECT sku, model_sku, brand, model, category, size, change, new_list_cents, new_cost_cents, new_outlet_cost_cents
         FROM vendor_changes WHERE change IN ('new', 'changed')`,
      )[0]
      const changes = (res?.values ?? []).map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]])))
      if (!changes.length) return { changed: 0, added: 0 }
      return save('applyImport', changes)
    },
    reset: async () => {
      throw new Error('Only the demo can be reset.')
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  return {
    client,
    source,
    auth: {
      get: () => auth,
      subscribe(listener) {
        authListeners.add(listener)
        return () => authListeners.delete(listener)
      },
      async sendCode(email) {
        const { error } = await client.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: browser ? window.location.origin + window.location.pathname : undefined },
        })
        if (error) throw new Error(plain(error.message))
      },
      async verifyCode(email, code) {
        const { error } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
        if (error) throw new Error(plain(error.message))
      },
      async signOut() {
        await client.auth.signOut()
      },
    },
  }
}

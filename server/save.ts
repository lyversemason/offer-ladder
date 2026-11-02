// Supabase Edge Function "save": every change in live mode goes through here.
// Bundled into supabase/functions/save by scripts/build-functions.ts, so it runs
// the very same engine and checks as the app (src/engine, src/data).
//
// Who is asking comes from their sign-in token, never from the request. A sale is
// priced again by the engine from its items before anything is written, and each
// change is written in one transaction by a database function only this server
// may call (supabase/migrations/*_saving.sql).
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeCatalog, validateSettings } from '../src/engine'
import type { Product, Settings } from '../src/engine'
import { OutcomeError, outcomeRows, priceOutcome } from '../src/data/outcome'
import type { Outcome } from '../src/source/types'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** A refusal the person should see, in plain words. */
class Refused extends Error {}

/** The stores are in US Eastern time; the server's clock is UTC. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

const CATEGORIES = ['mattress', 'foundation', 'adjustable-base', 'frame', 'pillow', 'protector', 'sheets']

interface Profile {
  id: string
  role: 'rep' | 'manager' | 'admin'
  store_id: string | null
  rep_id: string | null
  status: string
}

async function catalog(server: SupabaseClient): Promise<Product[]> {
  const out: Product[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await server.from('products').select('*').order('sku').range(from, from + 999)
    if (error) throw new Error(`products: ${error.message}`)
    for (const r of data) {
      const p: Product = { sku: r.sku, modelSku: r.model_sku, brand: r.brand, model: r.model, category: r.category, listCents: r.list_cents, costCents: r.cost_cents }
      if (r.size !== null) p.size = r.size
      if (r.outlet_list_cents !== null && r.outlet_cost_cents !== null) p.outlet = { listCents: r.outlet_list_cents, costCents: r.outlet_cost_cents }
      out.push(p)
    }
    if (data.length < 1000) return out
  }
}

async function rules(server: SupabaseClient): Promise<Settings> {
  const { data, error } = await server.from('settings_history').select('settings_json').order('id', { ascending: false }).limit(1).single()
  if (error) throw new Error(`settings: ${error.message}`)
  return data.settings_json as Settings
}

async function call(server: SupabaseClient, fn: string, args: object) {
  const { data, error } = await server.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}

async function recordOutcome(server: SupabaseClient, me: Profile, o: Outcome) {
  if (me.role !== 'rep') throw new Refused('Only reps record customers.')
  if (o.repId !== me.rep_id || o.storeId !== me.store_id) throw new Refused('You can only record your own customers.')
  const ctx = { catalog: makeCatalog(await catalog(server)), settings: await rules(server) }
  const date = today()
  const priced = priceOutcome({ ...o, date }, ctx)
  await call(server, 'save_outcome', { payload: outcomeRows({ ...o, date }, priced, date) })
  return { sale: priced.sale && { toplineCents: priced.sale.ev.toplineCents, commissionCents: priced.sale.ev.commissionCents }, offers: priced.offers.length }
}

async function saveSettings(server: SupabaseClient, me: Profile, settings: Settings) {
  if (me.role !== 'admin') throw new Refused('Only an admin can change the rules.')
  let problems: string[]
  try {
    problems = validateSettings(settings)
  } catch {
    problems = ['These rules are incomplete.']
  }
  if (problems.length) throw new Refused(`The rules weren't saved: ${problems.join(' ')}`)
  await call(server, 'save_settings', { settings })
  return {}
}

interface Change {
  sku: string
  model_sku: string
  brand: string
  model: string
  category: string
  size: string | null
  change: string
  new_list_cents: number
  new_cost_cents: number
  new_outlet_cost_cents: number | null
}

async function applyImport(server: SupabaseClient, me: Profile, changes: Change[]) {
  if (me.role !== 'admin') throw new Refused('Only an admin can change the catalog.')
  if (!Array.isArray(changes) || changes.length > 5000) throw new Refused('That change list is too long or unreadable.')
  const text = (v: unknown, max = 120) => typeof v === 'string' && v.length > 0 && v.length <= max
  const cents = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 100_000_000
  const known = new Set((await catalog(server)).map((p) => p.sku))
  changes.forEach((c, i) => {
    const ok =
      text(c.sku, 40) && text(c.model_sku, 40) && text(c.brand) && text(c.model) && CATEGORIES.includes(c.category) &&
      (c.size === null || text(c.size, 40)) && cents(c.new_list_cents) && cents(c.new_cost_cents) &&
      (c.new_outlet_cost_cents === null || cents(c.new_outlet_cost_cents)) &&
      (c.change === 'changed' ? known.has(c.sku) : c.change === 'new' && !known.has(c.sku))
    if (!ok) throw new Refused(`Change ${i + 1} (${String(c?.sku)}) can't be applied. Run the import again.`)
  })
  return await call(server, 'apply_catalog_changes', { changes })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
    const { data: auth } = await server.auth.getUser(token)
    if (!auth.user) return reply(401, { error: 'Please sign in again.' })
    const { data: me } = await server.from('profiles').select('id, role, store_id, rep_id, status').eq('auth_user_id', auth.user.id).maybeSingle<Profile>()
    if (!me || me.status !== 'active') return reply(403, { error: 'Your access is off. Nothing was saved.' })

    const { action, args } = (await req.json()) as { action: string; args: unknown }
    if (action === 'recordOutcome') return reply(200, await recordOutcome(server, me, args as Outcome))
    if (action === 'saveSettings') return reply(200, await saveSettings(server, me, args as Settings))
    if (action === 'applyImport') return reply(200, await applyImport(server, me, args as Change[]))
    return reply(400, { error: `Unknown action: ${action}` })
  } catch (e) {
    if (e instanceof Refused || e instanceof OutcomeError) return reply(400, { error: e.message })
    console.error(e)
    return reply(500, { error: 'Something went wrong on the server. Nothing was saved; try again.' })
  }
})

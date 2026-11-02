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
import { AccountError, applyAccountAction, changedRules } from '../src/data/accounts'
import type { AccountAction, AccountChange, AuditEntry, PersonRecord } from '../src/data/accounts'
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
  auth_user_id: string | null
  name: string
  email: string
  role: 'rep' | 'manager' | 'admin'
  store_id: string | null
  rep_id: string | null
  status: 'invited' | 'active' | 'off'
  invited_by: string | null
  invited_at: string | null
  activated_at: string | null
  turned_off_at: string | null
  turned_off_by: string | null
}

const toRecord = (r: Profile): PersonRecord => ({
  id: r.id, name: r.name, email: r.email, role: r.role, storeId: r.store_id, repId: r.rep_id, status: r.status,
  invitedBy: r.invited_by, invitedAt: r.invited_at, activatedAt: r.activated_at, turnedOffAt: r.turned_off_at, turnedOffBy: r.turned_off_by,
})

const auditRows = (entries: AuditEntry[]) =>
  entries.map((e) => ({ at: e.at, actor_id: e.actorId, action: e.action, target_id: e.targetId, detail: e.detail }))

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
  // The database's own refusals are meant for people; anything else is a fault.
  if (error) throw /Nothing was saved/.test(error.message) ? new Refused(error.message) : new Error(`${fn}: ${error.message}`)
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
  const before = await rules(server)
  let problems: string[]
  try {
    problems = validateSettings(settings)
  } catch {
    problems = ['These rules are incomplete.']
  }
  if (problems.length) throw new Refused(`The rules weren't saved: ${problems.join(' ')}`)
  const audit: AuditEntry = { at: new Date().toISOString(), actorId: me.id, action: 'rules_changed', targetId: null, detail: { changed: changedRules(before, settings) } }
  await call(server, 'save_settings', { settings, audit: auditRows([audit]) })
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
  const result = { changed: changes.filter((c) => c.change === 'changed').length, added: changes.filter((c) => c.change === 'new').length }
  const audit: AuditEntry = { at: new Date().toISOString(), actorId: me.id, action: 'catalog_imported', targetId: null, detail: result }
  return await call(server, 'apply_catalog_changes', { changes, audit: auditRows([audit]) })
}

/**
 * Sign-in accounts. An invited person gets a confirmed account marked invited_by,
 * so the normal sign-in email reads as an invitation; the mark goes once they've
 * accepted. Turning access off needs nothing here: the access rules stop every
 * read at once, and their next sign-in is told their access is off.
 */
async function setUpSignIn(server: SupabaseClient, change: AccountChange, action: AccountAction, people: Profile[], inviterName: string): Promise<Record<string, string>> {
  const authIds: Record<string, string> = {}
  for (const p of change.people) {
    const existing = people.find((x) => x.id === p.id)?.auth_user_id ?? null
    if (action.type === 'invite') {
      const { data, error } = await server.auth.admin.createUser({ email: p.email, email_confirm: true, user_metadata: { name: p.name, invited_by: inviterName } })
      if (error) throw new Error(`Couldn't set up their sign-in: ${error.message}`)
      authIds[p.id] = data.user.id
    } else if (existing) {
      const invitedBy = p.status === 'invited' ? inviterName : null
      const { error } = await server.auth.admin.updateUserById(existing, { user_metadata: { name: p.name, invited_by: invitedBy } })
      if (error) throw new Error(`Couldn't change their sign-in: ${error.message}`)
    }
  }
  return authIds
}

async function account(server: SupabaseClient, anon: SupabaseClient, me: Profile, action: AccountAction) {
  const { data, error } = await server.from('profiles').select('*')
  if (error) throw new Error(`profiles: ${error.message}`)
  const people = data as Profile[]
  const change = applyAccountAction(people.map(toRecord), me.id, action, new Date().toISOString())
  const authIds = await setUpSignIn(server, change, action, people, me.name)
  await call(server, 'apply_account_change', {
    change: {
      expect: change.people.flatMap((p) => {
        const was = people.find((x) => x.id === p.id)
        return was ? [{ id: p.id, status: was.status }] : []
      }),
      people: change.people.map((p) => ({
        id: p.id, auth_user_id: authIds[p.id] ?? null, name: p.name, email: p.email, role: p.role, store_id: p.storeId, rep_id: p.repId,
        status: p.status, invited_by: p.invitedBy, invited_at: p.invitedAt, activated_at: p.activatedAt, turned_off_at: p.turnedOffAt, turned_off_by: p.turnedOffBy,
      })),
      rep: change.newRep && { id: change.newRep.id, name: change.newRep.name, store_id: change.newRep.storeId, hired_on: change.newRep.hiredOn },
      audit: auditRows(change.audit),
    },
  })
  // Saved first, emailed after: if only the email fails, the change stands and it can be resent.
  if (change.email) {
    const { error: mailError } = await anon.auth.signInWithOtp({ email: change.email.to, options: { shouldCreateUser: false } })
    if (mailError) return { message: `${change.message.replace(/\.$/, '')}, but the email couldn't be sent (${mailError.message}). Try "Send again".` }
  }
  return { message: change.message }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
    const { data: auth } = await server.auth.getUser(token)
    if (!auth.user) return reply(401, { error: 'Please sign in again.' })
    const { data: me } = await server.from('profiles').select('*').eq('auth_user_id', auth.user.id).maybeSingle<Profile>()
    const { action, args } = (await req.json()) as { action: string; args: unknown }
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
    // An invited person's first sign-in accepts their invitation (within 7 days).
    if (action === 'acceptInvite' && me?.status === 'invited') return reply(200, await account(server, anon, me, { type: 'accept', id: me.id }))
    if (!me || me.status !== 'active') return reply(403, { error: 'Your access is off. Nothing was saved.' })

    if (action === 'recordOutcome') return reply(200, await recordOutcome(server, me, args as Outcome))
    if (action === 'saveSettings') return reply(200, await saveSettings(server, me, args as Settings))
    if (action === 'applyImport') return reply(200, await applyImport(server, me, args as Change[]))
    if (action === 'account') return reply(200, await account(server, anon, me, args as AccountAction))
    return reply(400, { error: `Unknown action: ${action}` })
  } catch (e) {
    if (e instanceof Refused || e instanceof OutcomeError || e instanceof AccountError) return reply(400, { error: e.message })
    console.error(e)
    return reply(500, { error: 'Something went wrong on the server. Nothing was saved; try again.' })
  }
})

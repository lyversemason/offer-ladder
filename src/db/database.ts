// The SQLite database: creating it, saving deals into it, and reading reports out.
// sql.js is SQLite compiled to run inside a web page. Every function here takes
// the database (or sql.js itself) as an argument, so the same code runs in the
// browser and in the tests.
import type { Database, SqlJsStatic, SqlValue } from 'sql.js'
import type { Deal, Evaluation, Product, Settings } from '../engine'
import type { Rep, Store } from '../data/org'
import { REPORTS } from './reports'
import schemaSql from './schema.sql?raw'

export type { Database, SqlJsStatic }

export interface QueryResult {
  columns: string[]
  rows: SqlValue[][]
  /** True when the result was cut off at the row limit. */
  truncated?: boolean
}

/** One price offered to a customer, as recorded in the offers table. */
export interface OfferRecord {
  toplineCents: number
  marginBp: number
  /** null = below the margin floor. */
  tierId: string | null
  commissionCents: number
  accepted: boolean
  /** The whole offer, when it was recorded in full: lines, delivery, financing, reasons. */
  detail?: OfferDetail
}

/** How a line's discount was entered: dollars off, percent off or a new price. */
export type DiscountHow = 'dollars' | 'percent' | 'new_price'
/** Whether it was entered on the line itself or on the whole ticket. */
export type DiscountScope = 'row' | 'ticket'

export interface OfferLineRecord {
  sku: string
  condition: string
  qty: number
  listCents: number
  discountCents: number
  netCents: number
  costCents: number
  locked: boolean
  /** null = no discount on this line. */
  discountHow: DiscountHow | null
  discountScope: DiscountScope | null
}

export interface OfferDetail {
  lines: OfferLineRecord[]
  /** null = pickup. */
  delivery: { tierId: string; listCents: number; priceCents: number } | null
  financingMonths: number | null
  reasons: string[]
}

/** One row of the events table: something a rep did in the app. */
export interface EventRecord {
  /** 'YYYY-MM-DD HH:MM:SS', store time. */
  at: string
  repId: string
  storeId: string
  sessionId: string
  /** null = not about a ticket (a session starting, say). */
  ticketId: string | null
  type: string
  how?: string | null
  scope?: string | null
  sku?: string | null
  value?: number | null
}

/** An empty database with all the tables. */
export function createDatabase(SQL: SqlJsStatic): Database {
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.exec(schemaSql)
  return db
}

export function seedOrg(db: Database, stores: Store[], reps: (Rep & { hiredOn?: string })[]) {
  for (const s of stores) db.run('INSERT INTO stores (id, name) VALUES (?, ?)', [s.id, s.name])
  for (const r of reps) {
    db.run('INSERT INTO reps (id, name, store_id, hired_on) VALUES (?, ?, ?, ?)', [
      r.id,
      r.name,
      r.storeId,
      r.hiredOn ?? null,
    ])
  }
}

export function seedCatalog(db: Database, products: Product[]) {
  const stmt = db.prepare(
    `INSERT INTO products (sku, model_sku, brand, model, category, size, list_cents, cost_cents,
       outlet_list_cents, outlet_cost_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const p of products) {
    stmt.run([
      p.sku,
      p.modelSku,
      p.brand,
      p.model,
      p.category,
      p.size ?? null,
      p.listCents,
      p.costCents,
      p.outlet?.listCents ?? null,
      p.outlet?.costCents ?? null,
    ])
  }
  stmt.free()
}

/** The catalog as the app uses it, read back from the products table. */
export function readCatalog(db: Database): Product[] {
  const res = db.exec(
    `SELECT sku, model_sku, brand, model, category, size, list_cents, cost_cents,
            outlet_list_cents, outlet_cost_cents
     FROM products ORDER BY rowid`,
  )
  if (!res.length) return []
  return res[0].values.map((v) => {
    const [sku, modelSku, brand, model, category, size, list, cost, ol, oc] = v
    const p: Product = {
      sku: String(sku),
      modelSku: String(modelSku),
      brand: String(brand),
      model: String(model),
      category: category as Product['category'],
      listCents: Number(list),
      costCents: Number(cost),
    }
    if (size !== null) p.size = String(size)
    if (ol !== null && oc !== null) p.outlet = { listCents: Number(ol), costCents: Number(oc) }
    return p
  })
}

export function saveSettings(db: Database, changedOn: string, settings: Settings) {
  db.run('INSERT INTO settings_history (changed_on, settings_json) VALUES (?, ?)', [
    changedOn,
    JSON.stringify(settings),
  ])
}

/** Records a customer the rep helped (an "up"). Returns the visit id. */
export function recordVisit(
  db: Database,
  v: { repId: string; storeId: string; date: string; sold: boolean; ticketId?: string | null },
): number {
  db.run('INSERT INTO visits (rep_id, store_id, visited_on, sold, ticket_id) VALUES (?, ?, ?, ?, ?)', [
    v.repId,
    v.storeId,
    v.date,
    v.sold ? 1 : 0,
    v.ticketId ?? null,
  ])
  return lastId(db)
}

/** Records the offers made to a customer who walked. */
export function recordWalkOffers(db: Database, visitId: number, offers: OfferRecord[]) {
  insertOffers(db, visitId, null, offers)
}

export interface SaveDealInput {
  repId: string
  storeId: string
  /** 'YYYY-MM-DD' */
  date: string
  deal: Deal
  /** The engine's result for this exact deal. */
  ev: Evaluation
  /** Every price offered, asking price first; the accepted one is the sale. */
  offers?: OfferRecord[]
  /** Which offer closed it: 0 = asking price. Defaults to the accepted offer. */
  closedAtRung?: number
  /** An existing visit; if left out, a sold visit is recorded too. */
  visitId?: number
  /** The ticket's id in the events table, for the visit recorded with the sale. */
  ticketId?: string | null
}

/**
 * Saves a sale: the deal's snapshot totals, its lines and its offers. Refuses a
 * deal the engine blocked (below the floor needs a manager approval flow, which
 * isn't built).
 */
export function saveDeal(db: Database, input: SaveDealInput): number {
  const { ev, deal } = input
  if (!ev.ok) throw new Error(`Can't save a blocked deal: ${ev.issues.map((i) => i.message).join(' ')}`)
  const offers = input.offers ?? []
  const acceptedAt = offers.findIndex((o) => o.accepted)
  const closedAtRung = input.closedAtRung ?? Math.max(0, acceptedAt)
  const visitId =
    input.visitId ??
    recordVisit(db, { repId: input.repId, storeId: input.storeId, date: input.date, sold: true, ticketId: input.ticketId })

  db.run(
    `INSERT INTO deals (visit_id, rep_id, store_id, closed_on, list_topline_cents, topline_cents,
       product_cost_cents, delivery_cost_cents, gross_cents, margin_bp, tier_id, rate_bp, attach,
       commission_cents, financing_months, financing_adj_cents, delivery_tier_id,
       delivery_price_cents, tax_cents, offers_made, closed_at_rung)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      visitId,
      input.repId,
      input.storeId,
      input.date,
      ev.listToplineCents,
      ev.toplineCents,
      ev.productCostCents,
      ev.deliveryCostCents,
      ev.grossCents,
      ev.marginBp,
      ev.tier?.id ?? null,
      ev.rateBp,
      ev.attach ? 1 : 0,
      ev.commissionCents,
      deal.financingMonths,
      ev.financingAdjCents,
      deal.delivery?.tierId ?? null,
      ev.deliveryPriceCents,
      ev.taxCents,
      offers.length ? offers.length - 1 : closedAtRung,
      closedAtRung,
    ],
  )
  const dealId = lastId(db)

  const stmt = db.prepare(
    `INSERT INTO deal_lines (deal_id, line_no, sku, condition, qty, list_cents,
       discount_cents, net_cents, cost_cents, locked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  ev.lines.forEach((l, i) => {
    stmt.run([
      dealId,
      i + 1,
      l.product.sku,
      l.condition,
      l.qty,
      l.listCents,
      l.discountCents,
      l.netCents,
      l.costCents,
      l.locked ? 1 : 0,
    ])
  })
  stmt.free()
  insertOffers(db, visitId, dealId, offers)
  return dealId
}

function insertOffers(db: Database, visitId: number, dealId: number | null, offers: OfferRecord[]) {
  const stmt = db.prepare(
    `INSERT INTO offers (visit_id, deal_id, step_no, topline_cents, margin_bp, tier_id,
       commission_cents, accepted, delivery_tier_id, delivery_list_cents, delivery_price_cents,
       financing_months)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const lineStmt = db.prepare(
    `INSERT INTO offer_lines (offer_id, line_no, sku, condition, qty, list_cents, discount_cents,
       net_cents, cost_cents, locked, discount_how, discount_scope)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const reasonStmt = db.prepare('INSERT INTO offer_reasons (offer_id, reason_no, reason) VALUES (?, ?, ?)')
  try {
    offers.forEach((o, i) => {
      const d = o.detail
      stmt.run([
        visitId,
        dealId,
        i,
        o.toplineCents,
        o.marginBp,
        o.tierId,
        o.commissionCents,
        o.accepted ? 1 : 0,
        d?.delivery?.tierId ?? null,
        d?.delivery?.listCents ?? null,
        d?.delivery?.priceCents ?? null,
        d?.financingMonths ?? null,
      ])
      if (!d) return
      const offerId = lastId(db)
      d.lines.forEach((l, n) => {
        lineStmt.run([
          offerId,
          n + 1,
          l.sku,
          l.condition,
          l.qty,
          l.listCents,
          l.discountCents,
          l.netCents,
          l.costCents,
          l.locked ? 1 : 0,
          l.discountHow,
          l.discountScope,
        ])
      })
      d.reasons.forEach((r, n) => reasonStmt.run([offerId, n + 1, r]))
    })
  } finally {
    stmt.free()
    lineStmt.free()
    reasonStmt.free()
  }
}

/** Adds one row to the events table (it can only ever be added to). */
export function logEvent(db: Database, e: EventRecord) {
  db.run(
    `INSERT INTO events (at, rep_id, store_id, session_id, ticket_id, type, how, scope, sku, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.at, e.repId, e.storeId, e.sessionId, e.ticketId, e.type, e.how ?? null, e.scope ?? null, e.sku ?? null, e.value ?? null],
  )
}

/** Records how many customers a rep helped on a day, as the store's own count reports it. */
export function recordTraffic(db: Database, t: { day: string; repId: string; storeId: string; ups: number }) {
  db.run('INSERT INTO traffic (day, rep_id, store_id, ups) VALUES (?, ?, ?, ?)', [t.day, t.repId, t.storeId, t.ups])
}

function lastId(db: Database): number {
  return db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
}

function toResult(db: Database, sql: string, limit = Infinity): QueryResult {
  const stmt = db.prepare(sql)
  try {
    const columns = stmt.getColumnNames()
    const rows: SqlValue[][] = []
    while (stmt.step()) {
      if (rows.length >= limit) return { columns, rows, truncated: true }
      rows.push(stmt.get())
    }
    return { columns, rows }
  } finally {
    stmt.free()
  }
}

/** Runs one of the built-in reports by id. */
export function runReport(db: Database, reportId: string): QueryResult {
  const report = REPORTS.find((r) => r.id === reportId)
  if (!report) throw new Error(`Unknown report ${reportId}`)
  return toResult(db, report.sql)
}

/** Words that change data or the database itself; none are allowed in the query lab. */
const FORBIDDEN = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'ATTACH', 'DETACH', 'PRAGMA',
  'VACUUM', 'REINDEX', 'ANALYZE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE',
  'RECURSIVE', 'TRANSACTION',
]

/** The query with comments and quoted text blanked out, so keywords inside them don't count. */
function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
}

/** Why a query-lab query isn't allowed, or null when it's a safe read-only SELECT. */
export function checkReadOnly(sql: string): string | null {
  const code = stripCommentsAndStrings(sql).trim().replace(/;\s*$/, '')
  if (!code) return 'Type a query first.'
  if (code.includes(';')) return 'Run one query at a time (no semicolons in the middle).'
  if (!/^(SELECT|WITH)\b/i.test(code)) return 'Only SELECT queries (or WITH ... SELECT) can run here.'
  for (const word of FORBIDDEN) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(code)) return `"${word}" isn't allowed: the query lab only reads data.`
  }
  if (/\bREPLACE\s+INTO\b/i.test(code)) return '"REPLACE INTO" isn\'t allowed: the query lab only reads data.'
  return null
}

/**
 * The query lab: runs one read-only SELECT and returns at most `limit` rows.
 * As a second safety net it runs inside a savepoint that is always rolled back,
 * so even a write that slipped past the check would be undone.
 */
export function runReadOnlyQuery(db: Database, sql: string, limit = 500): QueryResult {
  const problem = checkReadOnly(sql)
  if (problem) throw new Error(problem)
  db.run('SAVEPOINT query_lab')
  try {
    return toResult(db, sql.trim().replace(/;\s*$/, ''), limit)
  } finally {
    db.run('ROLLBACK TO query_lab')
    db.run('RELEASE query_lab')
  }
}

/** The whole database as bytes, to keep in the browser's storage. */
export function exportBytes(db: Database): Uint8Array {
  return db.export()
}

export function importBytes(SQL: SqlJsStatic, bytes: Uint8Array): Database {
  const db = new SQL.Database(bytes)
  db.run('PRAGMA foreign_keys = ON')
  return db
}

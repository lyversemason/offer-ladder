// The demo data source: the whole database lives in this browser (SQLite, through
// sql.js), built from the made-up history on the first visit and kept between
// visits by a DemoStorage (IndexedDB in the browser, memory in the tests).
// It follows the same rules as the live server: every offer is priced again with
// the engine before it's saved (src/data/outcome.ts), and saving an outcome is
// all or nothing.
import type { Database, SqlJsStatic } from 'sql.js'
import { makeCatalog } from '../engine'
import type { Settings } from '../engine'
import { buildDemoDatabase } from '../data/history'
import { priceOutcome } from '../data/outcome'
import { applyAccountAction, changedRules, invitationEmail } from '../data/accounts'
import { seedAccounts } from '../data/history'
import { DEFAULT_SETTINGS } from '../data/settings'
import {
  addAudit,
  addRep,
  createDatabase,
  exportBytes,
  importBytes,
  logEvents,
  readAudit,
  readCatalog,
  readPeople,
  recordVisit,
  recordWalkOffers,
  runReadOnlyQuery,
  runReport,
  saveDeal,
  savePeople,
  saveSettings,
  seedCatalog,
} from '../db/database'
import { APPLY_STEP } from '../import/pipeline'
import type { DataSource, Outcome, OutcomeSaved } from './types'

/**
 * Who you are in the demo's manager view: the owner, who may do everything (the
 * rules, the catalog import, every account). Live mode follows each person's role.
 */
export const DEMO_ACTOR = 'dana'

/** Where the demo keeps its database and rules between visits. */
export interface DemoStorage {
  /** The saved database (null = none yet), or ok: false when storage didn't answer. */
  loadDb(): Promise<{ ok: true; bytes: Uint8Array | null } | { ok: false }>
  saveDb(bytes: Uint8Array): void
  loadSettings(): Settings | null
  saveSettings(settings: Settings): void
}

/** Storage that forgets everything when the page closes (tests, and a fallback). */
export function memoryStorage(): DemoStorage {
  let db: Uint8Array | null = null
  let settings: Settings | null = null
  return {
    loadDb: async () => ({ ok: true, bytes: db }),
    saveDb: (bytes) => (db = bytes),
    loadSettings: () => settings,
    saveSettings: (s) => (settings = s),
  }
}

/** Usage events arrive in bursts; the database is saved once they pause this long. */
const EVENTS_SAVE_DELAY_MS = 1000

/** Opens the demo: the saved copy if there is one, otherwise a freshly built history. */
export async function openDemoSource(SQL: SqlJsStatic, storage: DemoStorage): Promise<DataSource> {
  const saved = await storage.loadDb()
  let db: Database = saved.ok && saved.bytes ? importBytes(SQL, saved.bytes) : buildDemoDatabase(SQL).db
  // When storage didn't answer, nothing is saved this visit, so a good saved copy
  // is never overwritten by a fresh demo.
  const saving = saved.ok
  const persist = () => {
    if (saving) storage.saveDb(exportBytes(db))
  }
  // A copy saved before accounts existed gets its people (and keeps everything else).
  if (!readPeople(db).length) {
    seedAccounts(db)
    persist()
  }
  if (saved.ok && !saved.bytes) persist()

  const listeners = new Set<() => void>()
  const changed = () => {
    persist()
    for (const l of listeners) l()
  }
  let eventsTimer: ReturnType<typeof setTimeout> | null = null

  /** Runs writes all or nothing. */
  const transaction = <T>(work: () => T): T => {
    db.run('SAVEPOINT demo_write')
    try {
      const result = work()
      db.run('RELEASE demo_write')
      return result
    } catch (e) {
      db.run('ROLLBACK TO demo_write')
      db.run('RELEASE demo_write')
      throw e
    }
  }

  const settings = async () => storage.loadSettings() ?? DEFAULT_SETTINGS

  return {
    mode: 'demo',
    saving,

    catalog: async () => readCatalog(db),
    settings,
    runReport: async (id) => runReport(db, id),
    runQuery: async (sql) => runReadOnlyQuery(db, sql),

    async recordOutcome(o: Outcome): Promise<OutcomeSaved> {
      // The same checks and pricing as the live server (src/data/outcome.ts).
      const priced = priceOutcome(o, { catalog: makeCatalog(readCatalog(db)), settings: await settings() })
      const sale = priced.sale
      transaction(() => {
        if (sale) {
          saveDeal(db, { repId: o.repId, storeId: o.storeId, date: o.date, deal: sale.deal, ev: sale.ev, offers: priced.offers, ticketId: o.ticketId })
        } else {
          const visitId = recordVisit(db, { repId: o.repId, storeId: o.storeId, date: o.date, sold: false, ticketId: o.ticketId })
          recordWalkOffers(db, visitId, priced.offers)
        }
      })
      changed()
      return { sale: sale && { toplineCents: sale.ev.toplineCents, commissionCents: sale.ev.commissionCents }, offers: priced.offers.length }
    },

    async logEvents(events) {
      if (!events.length) return
      logEvents(db, events)
      if (eventsTimer) clearTimeout(eventsTimer)
      eventsTimer = setTimeout(() => {
        eventsTimer = null
        changed()
      }, EVENTS_SAVE_DELAY_MS)
    },

    async saveSettings(next, changedOn) {
      const before = await settings()
      transaction(() => {
        saveSettings(db, changedOn, next)
        addAudit(db, [{ at: new Date().toISOString(), actorId: DEMO_ACTOR, action: 'rules_changed', targetId: null, detail: { changed: changedRules(before, next) } }])
      })
      storage.saveSettings(next)
      changed()
    },

    async importWorkspace() {
      const ws = createDatabase(SQL)
      seedCatalog(ws, readCatalog(db))
      return ws
    },

    async applyImport(ws) {
      const res = ws.exec('SELECT * FROM vendor_changes')[0]
      if (!res) return { changed: 0, added: 0 }
      const kinds = res.values.map((r) => r[res.columns.indexOf('change')])
      let result = { changed: 0, added: 0 }
      transaction(() => {
        // The approved list goes into a temporary table of the same name, so step 6
        // runs exactly as written (and as the SQL guide explains it).
        db.run(`CREATE TEMP TABLE vendor_changes (${res.columns.join(', ')})`)
        try {
          const insert = db.prepare(`INSERT INTO temp.vendor_changes VALUES (${res.columns.map(() => '?').join(', ')})`)
          for (const row of res.values) insert.run(row)
          insert.free()
          db.run(APPLY_STEP.sql)
        } finally {
          db.run('DROP TABLE temp.vendor_changes')
        }
        result = { changed: kinds.filter((k) => k === 'changed').length, added: kinds.filter((k) => k === 'new').length }
        addAudit(db, [{ at: new Date().toISOString(), actorId: DEMO_ACTOR, action: 'catalog_imported', targetId: null, detail: { ...result } }])
      })
      changed()
      return result
    },

    people: async () => readPeople(db),
    audit: async () => readAudit(db),

    async accountAction(action) {
      // The demo acts as the owner; accepting an invitation is done by the invited person.
      const actor = action.type === 'accept' ? action.id : DEMO_ACTOR
      const change = applyAccountAction(readPeople(db), actor, action, new Date().toISOString())
      transaction(() => {
        if (change.newRep) addRep(db, change.newRep)
        savePeople(db, change.people)
        addAudit(db, change.audit)
      })
      changed()
      return { message: change.message, email: change.email && { ...invitationEmail(change.email), personId: change.email.personId } }
    },

    async reset() {
      db.close()
      db = buildDemoDatabase(SQL).db
      changed()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

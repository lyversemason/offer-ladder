// The SQLite database in the browser. On the first visit it builds the demo
// (six months of made-up history); after that it's kept in this browser's
// IndexedDB, so deals a visitor records are still there next time.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import type { Product } from '../engine'
import { buildDemoDatabase } from '../data/history'
import { exportBytes, importBytes, readCatalog } from '../db/database'
import { withTimeout } from './timeout'
import type { Database, SqlJsStatic } from '../db/database'

const IDB_NAME = 'offerladder'
const IDB_STORE = 'files'
// v4: usage tracking tables. v5: the history fills them (events, full offers,
// traffic). v6: the offer_facts view, and base discounts work through each offer.
// Older copies are left unread, so the demo rebuilds once.
const DB_KEY = 'demo-db-v6'

/** How long to wait for the browser's storage before carrying on without it. */
export const STORAGE_WAIT_MS = 4000

// One connection for the whole visit (opening a new one for every save leaked them).
let connection: Promise<IDBDatabase> | null = null

function idb(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch((e: unknown) => {
    connection = null
    throw e
  })
  return connection
}

/** The saved copy (null = none saved yet), or ok: false when storage didn't answer. */
type Stored = { ok: true; bytes: Uint8Array | null } | { ok: false }

async function readStored(key: string): Promise<Stored> {
  const store = (await idb()).transaction(IDB_STORE).objectStore(IDB_STORE)
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve({ ok: true, bytes: (req.result as Uint8Array | undefined) ?? null })
    req.onerror = () => reject(req.error)
  })
}

function idbGet(key: string): Promise<Stored> {
  return withTimeout<Stored>(readStored(key), STORAGE_WAIT_MS, { ok: false })
}

async function idbSet(key: string, value: Uint8Array) {
  try {
    const tx = (await idb()).transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
  } catch {
    // Storage can be refused (private windows); the demo still works this visit.
  }
}

export interface DbHandle {
  status: 'loading' | 'ready' | 'error'
  db: Database | null
  /**
   * False when the browser's storage didn't answer: the demo was built fresh for
   * this visit, and nothing is saved (so a saved copy is never overwritten).
   */
  saving: boolean
  /** Bumps after every write, so screens know to re-read. */
  rev: number
  catalog: Product[] | null
  /** Call after writing to the database: re-reads and saves it in the browser. */
  changed: () => void
  /** Like changed(), a moment later, so a burst of usage events saves once. */
  changedSoon: () => void
  /** Throws away everything recorded here and rebuilds the demo history. */
  reset: () => void
}

export function useDatabase(): DbHandle {
  const [status, setStatus] = useState<DbHandle['status']>('loading')
  const [rev, setRev] = useState(0)
  const [saving, setSaving] = useState(true)
  const savingRef = useRef(true)
  const sqlRef = useRef<SqlJsStatic | null>(null)
  const dbRef = useRef<Database | null>(null)
  // The same database in state, for rendering (refs are for the callbacks).
  const [db, setDb] = useState<Database | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const SQL = await initSqlJs({ locateFile: () => wasmUrl })
        const saved = await idbGet(DB_KEY)
        let db: Database
        if (saved.ok && saved.bytes) {
          db = importBytes(SQL, saved.bytes)
        } else {
          db = buildDemoDatabase(SQL).db
          if (saved.ok) await idbSet(DB_KEY, exportBytes(db))
        }
        if (cancelled) return
        savingRef.current = saved.ok
        setSaving(saved.ok)
        sqlRef.current = SQL
        dbRef.current = db
        setDb(db)
        setStatus('ready')
        setRev((r) => r + 1)
      } catch (e) {
        console.error(e)
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const changed = useCallback(() => {
    if (!dbRef.current) return
    if (savingRef.current) void idbSet(DB_KEY, exportBytes(dbRef.current))
    setRev((r) => r + 1)
  }, [])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const changedSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      changed()
    }, 1000)
  }, [changed])

  const reset = useCallback(() => {
    if (!sqlRef.current) return
    dbRef.current?.close()
    const fresh = buildDemoDatabase(sqlRef.current).db
    dbRef.current = fresh
    setDb(fresh)
    if (savingRef.current) void idbSet(DB_KEY, exportBytes(fresh))
    setRev((r) => r + 1)
  }, [])

  // rev is the signal that the products table may have changed.
  const catalog = useMemo(() => (db && rev >= 0 ? readCatalog(db) : null), [db, rev])

  return { status, db, saving, rev, catalog, changed, changedSoon, reset }
}

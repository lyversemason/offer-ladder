// The SQLite database in the browser. On the first visit it builds the demo
// (six months of made-up history); after that it's kept in this browser's
// IndexedDB, so deals a visitor records are still there next time.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import type { Product } from '../engine'
import { buildDemoDatabase } from '../data/history'
import { exportBytes, importBytes, readCatalog } from '../db/database'
import type { Database, SqlJsStatic } from '../db/database'

const IDB_NAME = 'offerladder'
const IDB_STORE = 'files'
// v2: the 2025-lineup catalog (new products table); v1 copies are left unread.
const DB_KEY = 'demo-db-v3'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key: string): Promise<Uint8Array | null> {
  try {
    const store = (await idb()).transaction(IDB_STORE).objectStore(IDB_STORE)
    return await new Promise((resolve) => {
      const req = store.get(key)
      req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
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
  /** Bumps after every write, so screens know to re-read. */
  rev: number
  catalog: Product[] | null
  /** Call after writing to the database: re-reads and saves it in the browser. */
  changed: () => void
  /** Throws away everything recorded here and rebuilds the demo history. */
  reset: () => void
}

export function useDatabase(): DbHandle {
  const [status, setStatus] = useState<DbHandle['status']>('loading')
  const [rev, setRev] = useState(0)
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
        if (saved) {
          db = importBytes(SQL, saved)
        } else {
          db = buildDemoDatabase(SQL).db
          await idbSet(DB_KEY, exportBytes(db))
        }
        if (cancelled) return
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
    void idbSet(DB_KEY, exportBytes(dbRef.current))
    setRev((r) => r + 1)
  }, [])

  const reset = useCallback(() => {
    if (!sqlRef.current) return
    dbRef.current?.close()
    const fresh = buildDemoDatabase(sqlRef.current).db
    dbRef.current = fresh
    setDb(fresh)
    void idbSet(DB_KEY, exportBytes(fresh))
    setRev((r) => r + 1)
  }, [])

  // rev is the signal that the products table may have changed.
  const catalog = useMemo(() => (db && rev >= 0 ? readCatalog(db) : null), [db, rev])

  return { status, db, rev, catalog, changed, reset }
}

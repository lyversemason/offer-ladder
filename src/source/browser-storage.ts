// The demo's storage in a real browser: the database in IndexedDB (too big for
// localStorage), the rules in localStorage. Every wait has a time limit, so a
// browser whose storage doesn't answer still loads the demo (v0.16.1).
import type { Settings } from '../engine'
import type { DemoStorage } from './demo'
import { withTimeout } from './timeout'

const IDB_NAME = 'offerladder'
const IDB_STORE = 'files'
// v4: usage tracking tables. v5: the history fills them (events, full offers,
// traffic). v6: the offer_facts view, and base discounts work through each offer.
// Older copies are left unread, so the demo rebuilds once.
const DB_KEY = 'demo-db-v6'
const SETTINGS_KEY = 'offerladder:settings:v3'

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

type Stored = { ok: true; bytes: Uint8Array | null } | { ok: false }

async function readStored(key: string): Promise<Stored> {
  const store = (await idb()).transaction(IDB_STORE).objectStore(IDB_STORE)
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve({ ok: true, bytes: (req.result as Uint8Array | undefined) ?? null })
    req.onerror = () => reject(req.error)
  })
}

async function writeStored(key: string, value: Uint8Array) {
  try {
    const tx = (await idb()).transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
  } catch {
    // Storage can be refused (private windows); the demo still works this visit.
  }
}

export function browserStorage(): DemoStorage {
  return {
    loadDb: () => withTimeout<Stored>(readStored(DB_KEY), STORAGE_WAIT_MS, { ok: false }),
    saveDb: (bytes) => void writeStored(DB_KEY, bytes),
    loadSettings: () => {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY)
        return raw ? (JSON.parse(raw) as Settings) : null
      } catch {
        return null
      }
    },
    saveSettings: (s) => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
      } catch {
        // Storage refused: the rules still apply for this visit.
      }
    },
  }
}

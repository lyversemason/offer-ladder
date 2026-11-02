// The screens' connection to the data source: the demo source (the database in
// this browser) or, in live mode, the shared database (docs/accounts-plan.md).
// Either way the screens make the same calls.
import { useEffect, useState } from 'react'
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import type { Product, Settings } from '../engine'
import { browserStorage } from '../source/browser-storage'
import { openDemoSource } from '../source/demo'
import type { DataSource } from '../source/types'

export interface DataHandle {
  status: 'loading' | 'ready' | 'error'
  source: DataSource | null
  /** Bumps after every write, so screens know to read again. */
  rev: number
  catalog: Product[] | null
  settings: Settings | null
}

/** Opens the demo: the browser's own database. */
export async function openDemo(): Promise<DataSource> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  return openDemoSource(SQL, browserStorage())
}

export function useDataSource(open: () => Promise<DataSource>): DataHandle {
  const [status, setStatus] = useState<DataHandle['status']>('loading')
  const [source, setSource] = useState<DataSource | null>(null)
  const [rev, setRev] = useState(0)
  const [read, setRead] = useState<{ catalog: Product[]; settings: Settings } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const opened = await open()
        if (cancelled) return
        setSource(opened)
        setStatus('ready')
      } catch (e) {
        console.error(e)
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
    // Opened once per mount: a new source means a new screen (signing in remounts it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => source?.subscribe(() => setRev((r) => r + 1)), [source])

  // The catalog and rules, read again after every write (an import or new rules change them).
  useEffect(() => {
    if (!source) return
    let cancelled = false
    void Promise.all([source.catalog(), source.settings()]).then(([catalog, settings]) => {
      if (!cancelled) setRead({ catalog, settings })
    })
    return () => {
      cancelled = true
    }
  }, [source, rev])

  return { status, source, rev, catalog: read?.catalog ?? null, settings: read?.settings ?? null }
}

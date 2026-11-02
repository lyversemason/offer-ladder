// The screens' connection to the data source. Today that's always the demo
// source (the database in this browser); live mode (docs/accounts-plan.md) adds a
// second kind behind the same calls.
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

export function useDataSource(): DataHandle {
  const [status, setStatus] = useState<DataHandle['status']>('loading')
  const [source, setSource] = useState<DataSource | null>(null)
  const [rev, setRev] = useState(0)
  const [read, setRead] = useState<{ catalog: Product[]; settings: Settings } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const SQL = await initSqlJs({ locateFile: () => wasmUrl })
        const opened = await openDemoSource(SQL, browserStorage())
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

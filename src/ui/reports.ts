// Running a report from a screen: the data source answers asynchronously (the
// live one goes over the network), so the screen keeps the latest answer in state.
import { useEffect, useState } from 'react'
import type { QueryResult } from '../db/database'
import type { DataSource } from '../source/types'

export interface ReportState {
  result: QueryResult | null
  error: string | null
}

/** The latest result of one report; runs again when the report or the data changes. */
export function useReport(source: DataSource, id: string, rev: number): ReportState {
  const [state, setState] = useState<ReportState & { key: string }>({ key: '', result: null, error: null })
  const key = `${id}:${rev}`
  useEffect(() => {
    let cancelled = false
    source.runReport(id).then(
      (result) => !cancelled && setState({ key, result, error: null }),
      (e: unknown) => !cancelled && setState({ key, result: null, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [source, id, key])
  // While a different report loads, keep showing nothing rather than the old one's rows.
  return state.key.startsWith(`${id}:`) ? state : { result: null, error: null }
}

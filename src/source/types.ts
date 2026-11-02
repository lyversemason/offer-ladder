// The data source: everything the screens read from and write to the database,
// in one place. The screens never touch a database directly; they call these.
// The demo source (./demo.ts) keeps the database in this browser (SQLite). The
// live source (docs/accounts-plan.md, phase 3) will talk to the shared Postgres,
// where the same calls are checked by the server and the access rules.
import type { Database } from 'sql.js'
import type { Deal, Product, Settings } from '../engine'
import type { EventRecord, OfferRecord, QueryResult } from '../db/database'

export type Mode = 'demo' | 'live'

/** How a customer's conversation ended, as the rep's screen sends it. */
export interface Outcome {
  repId: string
  storeId: string
  /** 'YYYY-MM-DD' */
  date: string
  ticketId: string
  /** Every offer the customer heard, in order, the asking price first. For a sale the last one is marked accepted. */
  offers: OfferRecord[]
  /**
   * The ticket as it closed, for a sale (null when the customer walked). The
   * source prices it again with the engine and saves the engine's numbers, never
   * totals worked out by the screen.
   */
  sale: Deal | null
}

/** What was saved, in the source's own numbers (the screen shows these). */
export interface OutcomeSaved {
  sale: { toplineCents: number; commissionCents: number } | null
  offers: number
}

export interface ImportResult {
  changed: number
  added: number
}

export interface DataSource {
  readonly mode: Mode
  /**
   * False when this source can't keep what's written (the demo, when the
   * browser's storage isn't answering): it still works, for this visit only.
   */
  readonly saving: boolean

  /** The catalog reps sell from. */
  catalog(): Promise<Product[]>
  /** The rules in force. */
  settings(): Promise<Settings>
  /** One built-in report (src/db/reports.ts), by id. */
  runReport(id: string): Promise<QueryResult>
  /** The query lab: one read-only SELECT. Demo only (Mason, 2026-11-01). */
  runQuery(sql: string): Promise<QueryResult>

  /** Saves how a customer's conversation ended. */
  recordOutcome(outcome: Outcome): Promise<OutcomeSaved>
  /** Adds usage events (add-only). */
  logEvents(events: EventRecord[]): Promise<void>
  /** Saves new rules; the whole rule set is kept in the history. */
  saveSettings(settings: Settings, changedOn: string): Promise<void>
  /**
   * A scratch database for the catalog import's cleaning steps, holding a copy
   * of the catalog. Nothing done in it touches the real catalog.
   */
  importWorkspace(): Promise<Database>
  /** Applies the changes a manager approved in the workspace (step 6). */
  applyImport(workspace: Database): Promise<ImportResult>
  /** Demo only: throws away everything recorded and rebuilds the demo. */
  reset(): Promise<void>

  /** Called after anything is written, so screens can read again. Returns a way to stop listening. */
  subscribe(listener: () => void): () => void
}

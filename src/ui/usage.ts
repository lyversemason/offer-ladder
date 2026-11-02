// Usage tracking: writes one row to the events table for each meaningful thing a
// rep does (an item added, a discount applied, an offer recorded, a screen opened).
// Never keystrokes. The screens call track(type, details); this file adds who,
// when, which sitting (session) and which customer's ticket, then saves the row.
// No money math here, and nothing here decides anything for the rep.
import { createContext, useContext } from 'react'
import type { EventRecord } from '../db/database'

export type EventType =
  | 'session_started'
  | 'ticket_started'
  | 'sample_loaded'
  | 'item_added'
  | 'item_removed'
  | 'discount_applied'
  | 'discount_removed'
  | 'delivery_set'
  | 'financing_set'
  | 'reason_added'
  | 'floor_refused'
  | 'offer_recorded'
  | 'outcome_recorded'
  | 'ticket_abandoned'
  | 'gm_calculator_opened'
  | 'inventory_opened'
  | 'lookup_opened'

export interface TrackDetails {
  how?: string | null
  scope?: string | null
  sku?: string | null
  value?: number | null
}

export type Track = (type: EventType, details?: TrackDetails) => void

/** Events that put something on the ticket, so they start it if it hasn't started. */
const STARTS_TICKET: EventType[] = ['item_added', 'sample_loaded']

/** A sitting ends after this long without activity, like most analytics tools. */
export const SESSION_GAP_MS = 30 * 60 * 1000

export interface SessionState {
  id: string
  repId: string
  /** When the last event was written (ms since 1970). */
  lastAt: number
}

/** Whether the next event starts a new sitting: none yet, someone else, or a long gap. */
export function needsNewSession(session: SessionState | null, repId: string, now: number): boolean {
  return !session || session.repId !== repId || now - session.lastAt > SESSION_GAP_MS
}

/** 'YYYY-MM-DD HH:MM:SS' in the store's (this computer's) local time. */
export function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Writes one event; the data source does the saving. */
export type EventWriter = (e: EventRecord) => void

export interface TrackerDeps {
  /** Where events go, or null while the data source is still loading (nothing is written then). */
  log: () => EventWriter | null
  rep: () => { id: string; storeId: string }
  ticket: () => { id: string; started: boolean }
  /** Marks the current ticket as started (called once, with its first item). */
  markStarted: () => void
  now?: () => Date
  newSessionId?: () => string
  loadSession?: () => SessionState | null
  saveSession?: (s: SessionState) => void
}

const randomId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/**
 * The tracker. ensureSession() is called when a rep opens the app (the demo's
 * version of signing in); track() for everything after.
 */
export function createTracker(deps: TrackerDeps) {
  const now = deps.now ?? (() => new Date())
  const newSessionId = deps.newSessionId ?? (() => randomId('s'))
  let session: SessionState | null = deps.loadSession?.() ?? null

  const write = (log: EventWriter, at: Date, type: EventType, ticketId: string | null, d: TrackDetails = {}) => {
    const rep = deps.rep()
    log({ at: stamp(at), repId: rep.id, storeId: rep.storeId, sessionId: session!.id, ticketId, type, ...d })
  }

  /** Starts a new sitting if needed; returns false when the data source isn't ready. */
  const ensureSession = (): boolean => {
    const log = deps.log()
    if (!log) return false
    const at = now()
    const rep = deps.rep()
    if (needsNewSession(session, rep.id, at.getTime())) {
      session = { id: newSessionId(), repId: rep.id, lastAt: at.getTime() }
      write(log, at, 'session_started', null)
      deps.saveSession?.(session)
    }
    return true
  }

  const track: Track = (type, details) => {
    if (!ensureSession()) return
    const log = deps.log()!
    const at = now()
    const ticket = deps.ticket()
    let started = ticket.started
    if (!started && STARTS_TICKET.includes(type)) {
      write(log, at, 'ticket_started', ticket.id)
      deps.markStarted()
      started = true
    }
    write(log, at, type, started ? ticket.id : null, details)
    session = { ...session!, lastAt: at.getTime() }
    deps.saveSession?.(session)
  }

  return { track, ensureSession }
}

const SESSION_KEY = 'offerladder:session:v1'

export function loadStoredSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SessionState) : null
  } catch {
    return null
  }
}

export function storeSession(s: SessionState) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    // Storage refused (a private window): sittings just restart on reload.
  }
}

export const TrackContext = createContext<Track>(() => {})

/** The track() function for any screen inside the app. */
export const useTrack = () => useContext(TrackContext)

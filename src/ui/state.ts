// The app's working state: who is using it, the rules in force, and the deal on
// screen. Rules are kept in this browser (localStorage) so a manager's change
// shows up in the rep view right away. No money math here: that's the engine's job.
import { useEffect, useMemo, useReducer, useState } from 'react'
import { evaluate, makeCatalog } from '../engine'
import type { Condition, Ctx, Deal, Product, Settings } from '../engine'
import { CATALOG } from '../data/catalog'
import { DEFAULT_SETTINGS } from '../data/settings'

const SETTINGS_KEY = 'offerladder:settings:v1'
const PREFS_KEY = 'offerladder:prefs:v1'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private windows can refuse storage; the app still works for this visit.
  }
}

/**
 * The rules in force, and the context the engine needs. The catalog comes from
 * the database once it has loaded (so an approved import changes what reps can
 * sell); until then, the built-in demo catalog.
 */
export function useSettings(products: Product[] | null) {
  const [settings, setSettings] = useState<Settings>(() => load(SETTINGS_KEY, DEFAULT_SETTINGS))
  useEffect(() => save(SETTINGS_KEY, settings), [settings])
  const list = products ?? CATALOG
  const ctx: Ctx = useMemo(() => ({ catalog: makeCatalog(list), settings }), [list, settings])
  return { settings, setSettings, ctx, products: list, reset: () => setSettings(DEFAULT_SETTINGS) }
}

export type Role = 'rep' | 'manager'

export interface Prefs {
  role: Role
  repId: string
  guide: boolean
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => load(PREFS_KEY, { role: 'rep', repId: 'tasha', guide: true }))
  useEffect(() => save(PREFS_KEY, prefs), [prefs])
  return [prefs, (p: Partial<Prefs>) => setPrefs((cur) => ({ ...cur, ...p }))] as const
}

/** One price the rep said out loud to the customer. */
export interface OfferMade {
  toplineCents: number
  marginBp: number
  tierId: string | null
  commissionCents: number
}

export interface DealState {
  deal: Deal
  offers: OfferMade[]
}

export type DealAction =
  | { type: 'add'; sku: string }
  | { type: 'remove'; lineId: string }
  | { type: 'qty'; lineId: string; qty: number }
  | { type: 'condition'; lineId: string; condition: Condition }
  | { type: 'discount'; lineId: string; discountCents: number }
  | { type: 'delivery'; delivery: Deal['delivery'] }
  | { type: 'financing'; months: number | null }
  | { type: 'bundle-deal'; id: string; on: boolean }
  | { type: 'replace'; deal: Deal }
  | { type: 'offer'; offer: OfferMade }
  | { type: 'clear' }

export const EMPTY_DEAL: Deal = { lines: [], delivery: null, financingMonths: null, bundleDealIds: [] }

let nextId = 1
const newId = () => `line-${Date.now().toString(36)}-${nextId++}`

function dealReducer(state: DealState, action: DealAction): DealState {
  const deal = state.deal
  const lines = (fn: (l: Deal['lines'][number]) => Deal['lines'][number]) => ({ ...state, deal: { ...deal, lines: deal.lines.map(fn) } })
  switch (action.type) {
    case 'add': {
      const existing = deal.lines.find((l) => l.sku === action.sku && l.condition === 'new')
      if (existing) return lines((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l))
      const line = { id: newId(), sku: action.sku, condition: 'new' as const, qty: 1, discountCents: 0 }
      return { ...state, deal: { ...deal, lines: [...deal.lines, line] } }
    }
    case 'remove':
      return { ...state, deal: { ...deal, lines: deal.lines.filter((l) => l.id !== action.lineId) } }
    case 'qty':
      return lines((l) => (l.id === action.lineId ? { ...l, qty: action.qty } : l))
    case 'condition':
      return lines((l) => (l.id === action.lineId ? { ...l, condition: action.condition, discountCents: 0 } : l))
    case 'discount':
      return lines((l) => (l.id === action.lineId ? { ...l, discountCents: action.discountCents } : l))
    case 'delivery':
      return { ...state, deal: { ...deal, delivery: action.delivery } }
    case 'financing':
      return { ...state, deal: { ...deal, financingMonths: action.months } }
    case 'bundle-deal': {
      const ids = deal.bundleDealIds.filter((id) => id !== action.id)
      return { ...state, deal: { ...deal, bundleDealIds: action.on ? [...ids, action.id] : ids } }
    }
    case 'replace':
      return { ...state, deal: action.deal }
    case 'offer':
      return { ...state, offers: [...state.offers, action.offer] }
    case 'clear':
      return { deal: EMPTY_DEAL, offers: [] }
  }
}

const DEAL_KEY = 'offerladder:deal:v1'

export function useDeal() {
  const [state, dispatch] = useReducer(dealReducer, undefined, () => load<DealState>(DEAL_KEY, { deal: EMPTY_DEAL, offers: [] }))
  useEffect(() => save(DEAL_KEY, state), [state])
  return [state, dispatch] as const
}

/** A ready-made deal for the "try it" button: a bed, a base, pillows and delivery. */
export function sampleDeal(): Deal {
  return {
    lines: [
      { id: newId(), sku: 'LRK-HF-Q', condition: 'new', qty: 1, discountCents: 0 },
      { id: newId(), sku: 'GLD-BS-Q', condition: 'new', qty: 1, discountCents: 0 },
      { id: newId(), sku: 'TDW-CP-Q', condition: 'new', qty: 2, discountCents: 0 },
      { id: newId(), sku: 'LLH-DG-Q', condition: 'new', qty: 1, discountCents: 0 },
    ],
    delivery: { tierId: 'white-glove-base', priceCents: 19900 },
    financingMonths: null,
    bundleDealIds: [],
  }
}

/** Re-evaluates a deal only when the deal or the rules change. */
export function useEvaluation(deal: Deal, ctx: Ctx) {
  return useMemo(() => evaluate(deal, ctx), [deal, ctx])
}

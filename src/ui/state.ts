// The app's working state: who is using it, the rules in force, and the deal on
// screen. Rules are kept in this browser (localStorage) so a manager's change
// shows up in the rep view right away. No money math here: that's the engine's job.
import { useEffect, useMemo, useReducer, useState } from 'react'
import { evaluate, makeCatalog } from '../engine'
import type { Condition, Ctx, Deal, Evaluation, Product, Settings } from '../engine'
import { CATALOG } from '../data/catalog'
import { DEFAULT_SETTINGS } from '../data/settings'

const SETTINGS_KEY = 'offerladder:settings:v3'
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

/**
 * Why a discount is fair, said to the customer. The rep picks them; the app
 * only keeps track. They stack, and one can repeat (a Google review from each
 * of a couple).
 */
export const DISCOUNT_REASONS = [
  'Financing',
  'Military',
  'Police, fire or EMS',
  'Government',
  'Healthcare',
  'Teacher',
  'Student',
  'Google review',
  'Other',
] as const

/**
 * One iteration: a price the rep offered the customer, frozen with the whole
 * ticket as it was. Past iterations can be looked at but not changed.
 */
export interface OfferMade {
  toplineCents: number
  totalWithTaxCents: number
  savingsCents: number
  marginBp: number
  tierId: string | null
  commissionCents: number
  lines: { name: string; sku: string; size?: string; condition: Condition; qty: number; listCents: number; netCents: number }[]
  /** null = pickup. */
  delivery: { label: string; listCents: number; priceCents: number } | null
  financingMonths: number | null
  financingAdjCents: number
  reasons: string[]
}

/** Freezes the ticket as it is now into an iteration. */
export function snapshot(deal: Deal, ev: Evaluation, settings: Settings, reasons: string[]): OfferMade {
  const tier = deal.delivery ? settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId) : undefined
  return {
    toplineCents: ev.toplineCents,
    totalWithTaxCents: ev.totalWithTaxCents,
    savingsCents: ev.savingsCents,
    marginBp: ev.marginBp,
    tierId: ev.tier?.id ?? null,
    commissionCents: ev.commissionCents,
    lines: ev.lines.map((l) => ({
      name: `${l.product.brand} ${l.product.model}`,
      sku: l.product.sku,
      size: l.product.size,
      condition: l.condition,
      qty: l.qty,
      listCents: l.listCents,
      netCents: l.netCents,
    })),
    delivery: deal.delivery ? { label: tier?.label ?? deal.delivery.tierId, listCents: ev.deliveryListCents, priceCents: ev.deliveryPriceCents } : null,
    financingMonths: deal.financingMonths,
    financingAdjCents: ev.financingAdjCents,
    reasons: [...reasons],
  }
}

export interface DealState {
  deal: Deal
  /** Discount reasons on the ticket being worked (carried into each iteration). */
  reasons: string[]
  offers: OfferMade[]
}

export type DealAction =
  | { type: 'add'; sku: string }
  | { type: 'remove'; lineId: string }
  | { type: 'size'; lineId: string; sku: string }
  | { type: 'qty'; lineId: string; qty: number }
  | { type: 'condition'; lineId: string; condition: Condition }
  | { type: 'discount'; lineId: string; discountCents: number }
  | { type: 'delivery'; delivery: Deal['delivery'] }
  | { type: 'financing'; months: number | null }
  | { type: 'replace'; deal: Deal }
  | { type: 'add-reason'; reason: string }
  | { type: 'remove-reason'; index: number }
  | { type: 'offer'; offer: OfferMade }
  | { type: 'clear' }

export const EMPTY_DEAL: Deal = { lines: [], delivery: null, financingMonths: null }
const EMPTY_STATE: DealState = { deal: EMPTY_DEAL, reasons: [], offers: [] }

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
    case 'size':
      // Another size of the same model: a different item, so any discount starts over.
      return lines((l) => (l.id === action.lineId ? { ...l, sku: action.sku, discountCents: 0 } : l))
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
    case 'replace':
      return { ...state, deal: action.deal }
    case 'add-reason':
      return { ...state, reasons: [...state.reasons, action.reason] }
    case 'remove-reason':
      return { ...state, reasons: state.reasons.filter((_, i) => i !== action.index) }
    case 'offer':
      return { ...state, offers: [...state.offers, action.offer] }
    case 'clear':
      return EMPTY_STATE
  }
}

const DEAL_KEY = 'offerladder:deal:v3'

export function useDeal() {
  const [state, dispatch] = useReducer(dealReducer, undefined, () => load<DealState>(DEAL_KEY, EMPTY_STATE))
  useEffect(() => save(DEAL_KEY, state), [state])
  return [state, dispatch] as const
}

/** A ready-made deal for the "try it" button: a bed, a base, pillows, a protector and delivery. */
export function sampleDeal(): Deal {
  return {
    lines: [
      // Georgia Golden Prairie Firm Hybrid, Cambria Gentle Drift Base, two Meridian
      // Cozy Nook pillows and a Meridian Snug Blanket protector, all Queen.
      { id: newId(), sku: '366239-Q', condition: 'new', qty: 1, discountCents: 0 },
      { id: newId(), sku: '365028-Q', condition: 'new', qty: 1, discountCents: 0 },
      { id: newId(), sku: '365983-Q', condition: 'new', qty: 2, discountCents: 0 },
      { id: newId(), sku: '366272-Q', condition: 'new', qty: 1, discountCents: 0 },
    ],
    delivery: { tierId: 'platinum', priceCents: 17999 },
    financingMonths: null,
  }
}

/** Re-evaluates a deal only when the deal or the rules change. */
export function useEvaluation(deal: Deal, ctx: Ctx) {
  return useMemo(() => evaluate(deal, ctx), [deal, ctx])
}

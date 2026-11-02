// The app's working state: who is using it, the rules in force, and the deal on
// screen. Rules are kept in this browser (localStorage) so a manager's change
// shows up in the rep view right away. No money math here: that's the engine's job.
import { useEffect, useMemo, useReducer, useState } from 'react'
import { evaluate, makeCatalog } from '../engine'
import type { Condition, Ctx, Deal, Evaluation, Product, Settings } from '../engine'
import { CATALOG } from '../data/catalog'
import { DEFAULT_SETTINGS } from '../data/settings'
import type { DiscountHow, DiscountScope } from '../db/database'

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
/**
 * The rules and catalog the engine prices with: the data source's, or the
 * built-in defaults until it has loaded (a moment on the first visit).
 */
export function useSettings(products: Product[] | null, loaded: Settings | null) {
  const settings = loaded ?? DEFAULT_SETTINGS
  const list = products ?? CATALOG
  const ctx: Ctx = useMemo(() => ({ catalog: makeCatalog(list), settings }), [list, settings])
  return { settings, ctx, products: list }
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
  lines: OfferLine[]
  /** null = pickup. tierId is missing on iterations saved before v0.14.0. */
  delivery: { tierId?: string; label: string; listCents: number; priceCents: number } | null
  financingMonths: number | null
  financingAdjCents: number
  reasons: string[]
}

/**
 * One line of a frozen iteration. The fields after netCents are missing on
 * iterations saved before v0.14.0 (usage tracking).
 */
export interface OfferLine {
  name: string
  sku: string
  size?: string
  condition: Condition
  qty: number
  listCents: number
  netCents: number
  costCents?: number
  locked?: boolean
  discountHow?: DiscountHow | null
  discountScope?: DiscountScope | null
}

/** How a line's discount was entered, kept per line id while the rep works. */
export type DiscountVia = { how: DiscountHow; scope: DiscountScope }

/** Freezes the ticket as it is now into an iteration. */
export function snapshot(
  deal: Deal,
  ev: Evaluation,
  settings: Settings,
  reasons: string[],
  lineVia: Record<string, DiscountVia> = {},
): OfferMade {
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
      costCents: l.costCents,
      locked: l.locked,
      discountHow: l.discountCents !== 0 ? (lineVia[l.lineId]?.how ?? null) : null,
      discountScope: l.discountCents !== 0 ? (lineVia[l.lineId]?.scope ?? null) : null,
    })),
    delivery: deal.delivery
      ? { tierId: deal.delivery.tierId, label: tier?.label ?? deal.delivery.tierId, listCents: ev.deliveryListCents, priceCents: ev.deliveryPriceCents }
      : null,
    financingMonths: deal.financingMonths,
    financingAdjCents: ev.financingAdjCents,
    reasons: [...reasons],
  }
}

export interface DealState {
  /** This customer's ticket in the usage log; a new one for every customer. */
  ticketId: string
  /** True once the ticket has been started (its first item), so it's logged once. */
  started: boolean
  deal: Deal
  /** Discount reasons on the ticket being worked (carried into each iteration). */
  reasons: string[]
  offers: OfferMade[]
  /** How each discounted line's discount was entered, by line id. */
  lineVia: Record<string, DiscountVia>
}

export type DealAction =
  | { type: 'add'; sku: string }
  | { type: 'remove'; lineId: string }
  | { type: 'size'; lineId: string; sku: string }
  | { type: 'qty'; lineId: string; qty: number }
  | { type: 'condition'; lineId: string; condition: Condition }
  | { type: 'discount'; lineId: string; discountCents: number; via?: DiscountVia }
  | { type: 'delivery'; delivery: Deal['delivery'] }
  | { type: 'financing'; months: number | null }
  /** A whole new deal: the sample, or a whole-ticket discount (with how it was entered). */
  | { type: 'replace'; deal: Deal; via?: DiscountVia }
  | { type: 'started' }
  | { type: 'add-reason'; reason: string }
  | { type: 'remove-reason'; index: number }
  | { type: 'offer'; offer: OfferMade }
  | { type: 'clear' }

export const EMPTY_DEAL: Deal = { lines: [], delivery: null, financingMonths: null }

let nextId = 1
const newId = () => `line-${Date.now().toString(36)}-${nextId++}`

/** A ticket id that won't repeat: the time plus a random part. */
export const newTicketId = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const emptyState = (): DealState => ({
  ticketId: newTicketId(),
  started: false,
  deal: EMPTY_DEAL,
  reasons: [],
  offers: [],
  lineVia: {},
})

/** The line-id → how map without one line. */
const without = (via: Record<string, DiscountVia>, lineId: string) => {
  const next = { ...via }
  delete next[lineId]
  return next
}

export function dealReducer(state: DealState, action: DealAction): DealState {
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
      return { ...lines((l) => (l.id === action.lineId ? { ...l, sku: action.sku, discountCents: 0 } : l)), lineVia: without(state.lineVia, action.lineId) }
    case 'remove':
      return { ...state, deal: { ...deal, lines: deal.lines.filter((l) => l.id !== action.lineId) }, lineVia: without(state.lineVia, action.lineId) }
    case 'qty':
      return lines((l) => (l.id === action.lineId ? { ...l, qty: action.qty } : l))
    case 'condition':
      return { ...lines((l) => (l.id === action.lineId ? { ...l, condition: action.condition, discountCents: 0 } : l)), lineVia: without(state.lineVia, action.lineId) }
    case 'discount': {
      const next = lines((l) => (l.id === action.lineId ? { ...l, discountCents: action.discountCents } : l))
      const lineVia =
        action.discountCents === 0 ? without(state.lineVia, action.lineId)
        : action.via ? { ...state.lineVia, [action.lineId]: action.via }
        : state.lineVia
      return { ...next, lineVia }
    }
    case 'delivery':
      return { ...state, deal: { ...deal, delivery: action.delivery } }
    case 'financing':
      return { ...state, deal: { ...deal, financingMonths: action.months } }
    case 'replace': {
      // A whole-ticket discount marks every discounted line with how it was entered;
      // anything else (the sample deal) starts the marks over.
      const lineVia: Record<string, DiscountVia> = {}
      if (action.via) for (const l of action.deal.lines) if (l.discountCents !== 0) lineVia[l.id] = action.via
      return { ...state, deal: action.deal, lineVia }
    }
    case 'started':
      return { ...state, started: true }
    case 'add-reason':
      return { ...state, reasons: [...state.reasons, action.reason] }
    case 'remove-reason':
      return { ...state, reasons: state.reasons.filter((_, i) => i !== action.index) }
    case 'offer':
      return { ...state, offers: [...state.offers, action.offer] }
    case 'clear':
      return emptyState()
  }
}

const DEAL_KEY = 'offerladder:deal:v3'

/** A saved ticket, filled out with the fields older versions didn't save. */
function loadDeal(): DealState {
  const saved = load<Partial<DealState> | null>(DEAL_KEY, null)
  if (!saved?.deal) return emptyState()
  return { ...emptyState(), ...saved, started: saved.started ?? saved.deal.lines.length > 0 }
}

export function useDeal() {
  const [state, dispatch] = useReducer(dealReducer, undefined, loadDeal)
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

import type { Bp, Cents } from './money'

export type Category =
  | 'mattress'
  | 'foundation'
  | 'adjustable-base'
  | 'pillow'
  | 'protector'
  | 'sheets'
  | 'protection-plan'

/** New stock, a floor model off the showroom, or clearance. Each has its own cost. */
export type Condition = 'new' | 'floor' | 'clearance'

export interface PriceCost {
  listCents: Cents
  costCents: Cents
}

export interface Product {
  sku: string
  brand: string
  model: string
  category: Category
  size?: string
  /** New-stock price and cost. */
  listCents: Cents
  costCents: Cents
  floor?: PriceCost
  clearance?: PriceCost
}

export interface Tier {
  id: string
  label: string
  /** Lowest margin that still earns this tier. */
  minMarginBp: Bp
  /** Commission rate, paid on gross profit dollars. */
  rateBp: Bp
}

export interface DeliveryTier {
  id: string
  label: string
  priceCents: Cents
  /** The lowest price a rep may charge for it. */
  minPriceCents: Cents
}

export type BundleDeal =
  | {
      id: string
      kind: 'nth-off'
      label: string
      category: Category
      /** Every nth unit (2 = every second one) gets the discount. */
      nth: number
      pctOffBp: Bp
    }
  | {
      id: string
      kind: 'with-anchor'
      label: string
      category: Category
      /** The deal applies when the sale includes this category. */
      anchorCategory: Category
      pctOffBp: Bp
    }

export interface FinancingBand {
  /** Lowest amount financed (pre-tax) in this band. */
  minCents: Cents
  /**
   * Gross-dollar adjustment per term, in the same order as FinancingChart.terms.
   * Positive is added to the sale's gross dollars, negative is subtracted,
   * null means the term isn't offered at this amount.
   */
  adjustments: (Cents | null)[]
}

export interface FinancingChart {
  /** Terms in months, e.g. [6, 12, 24]. */
  terms: number[]
  /** Sorted by minCents, lowest first. */
  bands: FinancingBand[]
}

export interface Settings {
  /** Highest tier first. The last tier's minimum is the margin floor. */
  tiers: Tier[]
  attach: { category: Category; bonusBp: Bp }
  /** Each offer must cut at least this much: the larger of the two. */
  minStep: { cents: Cents; pctBp: Bp }
  /** What one delivery costs the store; it comes out of gross dollars. */
  deliveryCostCents: Cents
  deliveryTiers: DeliveryTier[]
  bundleDeals: BundleDeal[]
  financing: FinancingChart
  /** Brands and categories that can't be discounted. */
  priceLock: { brands: string[]; categories: Category[] }
  /** Offers are rounded up to a multiple of this (1000 = whole $10). */
  roundToCents: Cents
}

export interface DealLine {
  id: string
  sku: string
  condition: Condition
  qty: number
  /** The rep's discount on this line in total cents (not per unit). */
  discountCents: Cents
}

export interface Deal {
  lines: DealLine[]
  /** null = the customer takes it home, no delivery. */
  delivery: { tierId: string; priceCents: Cents } | null
  /** null = paying without financing. */
  financingMonths: number | null
  bundleDealIds: string[]
}

export type IssueLevel = 'block' | 'warn'

export interface Issue {
  level: IssueLevel
  code:
    | 'unknown-sku'
    | 'bad-qty'
    | 'condition-unavailable'
    | 'locked-discounted'
    | 'below-cost'
    | 'negative-discount'
    | 'below-floor'
    | 'delivery-below-min'
    | 'unknown-delivery'
    | 'financing-unavailable'
    | 'unknown-bundle-deal'
  message: string
  lineId?: string
}

export interface LineResult {
  lineId: string
  product: Product
  condition: Condition
  qty: number
  unitListCents: Cents
  unitCostCents: Cents
  listCents: Cents
  costCents: Cents
  /** Off from bundle deals. */
  promoCents: Cents
  /** Off from the rep. */
  discountCents: Cents
  netCents: Cents
  locked: boolean
}

export interface Evaluation {
  lines: LineResult[]
  deliveryListCents: Cents
  deliveryPriceCents: Cents
  /** Sum of list prices, before any deal or discount. */
  listToplineCents: Cents
  /** What the customer pays (pre-tax). */
  toplineCents: Cents
  /** list topline − topline */
  savingsCents: Cents
  productCostCents: Cents
  deliveryCostCents: Cents
  financingAdjCents: Cents
  grossCents: Cents
  marginBp: Bp
  /** null = below the floor (or an empty deal). */
  tier: Tier | null
  attach: boolean
  rateBp: Bp
  commissionCents: Cents
  issues: Issue[]
  /** True when nothing blocks the deal. */
  ok: boolean
}

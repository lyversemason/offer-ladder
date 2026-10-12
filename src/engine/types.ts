import type { Bp, Cents } from './money'

export type Category =
  | 'mattress'
  | 'foundation'
  | 'adjustable-base'
  | 'pillow'
  | 'protector'
  | 'sheets'
  | 'frame'

/**
 * New stock, or an outlet piece (returned or pre-owned). An outlet piece costs the
 * store less, so the same price earns more margin.
 */
export type Condition = 'new' | 'outlet'

export interface PriceCost {
  listCents: Cents
  costCents: Cents
}

export interface Product {
  /**
   * The item code a rep types: the model's SKU plus a size code ("365927-Q").
   * Every size of a model shares the model's SKU, as on a vendor's cost sheet.
   */
  sku: string
  /** The six-digit SKU shared by every size of the model. */
  modelSku: string
  brand: string
  model: string
  category: Category
  size?: string
  /** New-stock price and cost. */
  listCents: Cents
  costCents: Cents
  /** Price and cost as an outlet piece; missing when it can't be sold that way. */
  outlet?: PriceCost
}

/**
 * "A mattress from this brand only goes on a foundation or adjustable base from
 * these brands" (a maker's warranty rule).
 */
export interface PairingRule {
  brand: string
  supportBrands: string[]
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
  /**
   * The margin the offer ladder's final offer stops at. Reps can still go lower,
   * down to the margin floor; the ladder just doesn't suggest it.
   */
  finalOfferMarginBp: Bp
  /** What one delivery costs the store; it comes out of gross dollars. */
  deliveryCostCents: Cents
  deliveryTiers: DeliveryTier[]
  bundleDeals: BundleDeal[]
  financing: FinancingChart
  /** Models (by their shared SKU) that can't be discounted. */
  priceLock: { models: string[] }
  pairing: PairingRule[]
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
  /** null = pickup: the customer takes it home, no delivery and no delivery cost. */
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
    | 'pairing'
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

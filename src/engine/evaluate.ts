import { applyBp, formatMoney, formatPct, marginBp, meetsMargin } from './money'
import type { Cents } from './money'
import type {
  BundleDeal,
  Condition,
  Deal,
  Evaluation,
  Issue,
  LineResult,
  Product,
  Settings,
  Tier,
} from './types'

export type Catalog = ReadonlyMap<string, Product>

export interface Ctx {
  catalog: Catalog
  settings: Settings
}

export function makeCatalog(products: Product[]): Catalog {
  return new Map(products.map((p) => [p.sku, p]))
}

export function isLocked(product: Product, settings: Settings): boolean {
  return (
    settings.priceLock.brands.includes(product.brand) ||
    settings.priceLock.categories.includes(product.category)
  )
}

/** List price and cost for a product in a condition, or null if it isn't sold that way. */
export function priceCost(product: Product, condition: Condition) {
  if (condition === 'new') return { listCents: product.listCents, costCents: product.costCents }
  return product[condition] ?? null
}

/** The highest tier this margin earns, or null when it's below the floor. */
export function tierFor(grossCents: Cents, toplineCents: Cents, tiers: Tier[]): Tier | null {
  return tiers.find((t) => meetsMargin(grossCents, toplineCents, t.minMarginBp)) ?? null
}

export function floorBp(settings: Settings): number {
  return settings.tiers[settings.tiers.length - 1].minMarginBp
}

/** Gross-dollar adjustment for financing this amount over this term; null = not offered. */
export function financingAdjustment(
  settings: Settings,
  months: number,
  amountCents: Cents,
): Cents | null {
  const termIndex = settings.financing.terms.indexOf(months)
  if (termIndex === -1) return null
  let band = null
  for (const b of settings.financing.bands) if (amountCents >= b.minCents) band = b
  if (!band) return null
  return band.adjustments[termIndex] ?? null
}

/** Bundle-deal discounts per line id, worked out on list prices. */
function promoByLine(rows: LineResult[], deals: BundleDeal[]): Map<string, Cents> {
  const promo = new Map<string, Cents>()
  const add = (lineId: string, cents: Cents) => promo.set(lineId, (promo.get(lineId) ?? 0) + cents)
  for (const deal of deals) {
    const eligible = rows.filter((r) => r.product.category === deal.category && !r.locked)
    if (deal.kind === 'nth-off') {
      // One entry per unit, most expensive first, so the cheaper item of each
      // pair gets the discount (the usual "second one half off").
      const units = eligible
        .flatMap((r) => Array.from({ length: r.qty }, () => r))
        .sort((a, b) => b.unitListCents - a.unitListCents)
      units.forEach((r, i) => {
        if ((i + 1) % deal.nth === 0) add(r.lineId, applyBp(r.unitListCents, deal.pctOffBp))
      })
    } else {
      const hasAnchor = rows.some((r) => r.product.category === deal.anchorCategory)
      if (hasAnchor) for (const r of eligible) add(r.lineId, applyBp(r.listCents, deal.pctOffBp))
    }
  }
  return promo
}

export function evaluate(deal: Deal, ctx: Ctx): Evaluation {
  const { catalog, settings } = ctx
  const issues: Issue[] = []
  const rows: LineResult[] = []

  for (const line of deal.lines) {
    const product = catalog.get(line.sku)
    if (!product) {
      issues.push({
        level: 'block',
        code: 'unknown-sku',
        lineId: line.id,
        message: `No product with SKU ${line.sku}. Pick it from the catalog instead of guessing.`,
      })
      continue
    }
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      issues.push({
        level: 'block',
        code: 'bad-qty',
        lineId: line.id,
        message: `Quantity for ${product.model} must be a whole number of 1 or more.`,
      })
      continue
    }
    const pc = priceCost(product, line.condition)
    if (!pc) {
      issues.push({
        level: 'block',
        code: 'condition-unavailable',
        lineId: line.id,
        message: `${product.model} isn't available as a ${line.condition} model.`,
      })
      continue
    }
    rows.push({
      lineId: line.id,
      product,
      condition: line.condition,
      qty: line.qty,
      unitListCents: pc.listCents,
      unitCostCents: pc.costCents,
      listCents: pc.listCents * line.qty,
      costCents: pc.costCents * line.qty,
      promoCents: 0,
      discountCents: line.discountCents,
      netCents: 0,
      locked: isLocked(product, settings),
    })
  }

  const activeDeals: BundleDeal[] = []
  for (const id of deal.bundleDealIds) {
    const found = settings.bundleDeals.find((d) => d.id === id)
    if (found) activeDeals.push(found)
    else
      issues.push({
        level: 'block',
        code: 'unknown-bundle-deal',
        message: `The bundle deal "${id}" isn't offered right now.`,
      })
  }
  const promo = promoByLine(rows, activeDeals)

  for (const r of rows) {
    r.promoCents = promo.get(r.lineId) ?? 0
    r.netCents = r.listCents - r.promoCents - r.discountCents
    if (r.discountCents < 0) {
      issues.push({
        level: 'block',
        code: 'negative-discount',
        lineId: r.lineId,
        message: `${r.product.model} can't be priced above its list price.`,
      })
    }
    if (r.locked && r.discountCents !== 0) {
      issues.push({
        level: 'block',
        code: 'locked-discounted',
        lineId: r.lineId,
        message: `${r.product.brand} ${r.product.model} is price-locked: it sells at list price. Find the margin elsewhere in the bundle.`,
      })
    }
    if (r.netCents < r.costCents) {
      issues.push({
        level: 'block',
        code: 'below-cost',
        lineId: r.lineId,
        message: `${r.product.model} is priced below what it costs the store.`,
      })
    }
  }

  let deliveryListCents = 0
  let deliveryPriceCents = 0
  let deliveryCostCents = 0
  if (deal.delivery) {
    const tier = settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId)
    if (!tier) {
      issues.push({
        level: 'block',
        code: 'unknown-delivery',
        message: `Unknown delivery option "${deal.delivery.tierId}".`,
      })
    } else {
      deliveryListCents = tier.priceCents
      deliveryPriceCents = deal.delivery.priceCents
      deliveryCostCents = settings.deliveryCostCents
      if (deliveryPriceCents < tier.minPriceCents) {
        issues.push({
          level: 'block',
          code: 'delivery-below-min',
          message: `${tier.label} delivery can't go below its minimum price.`,
        })
      }
    }
  }

  const listToplineCents = rows.reduce((s, r) => s + r.listCents, 0) + deliveryListCents
  const toplineCents = rows.reduce((s, r) => s + r.netCents, 0) + deliveryPriceCents
  const productCostCents = rows.reduce((s, r) => s + r.costCents, 0)

  let financingAdjCents = 0
  if (deal.financingMonths !== null && toplineCents > 0) {
    const adj = financingAdjustment(settings, deal.financingMonths, toplineCents)
    if (adj === null) {
      issues.push({
        level: 'block',
        code: 'financing-unavailable',
        message: `${deal.financingMonths}-month financing isn't offered at this amount.`,
      })
    } else {
      financingAdjCents = adj
    }
  }

  const grossCents = toplineCents - productCostCents - deliveryCostCents + financingAdjCents
  const tier = toplineCents > 0 ? tierFor(grossCents, toplineCents, settings.tiers) : null
  if (toplineCents > 0 && !tier) {
    issues.push({
      level: 'block',
      code: 'below-floor',
      message: `Below the ${formatPct(floorBp(settings), 0)} margin floor: this price needs manager approval.`,
    })
  }
  const attach = rows.some((r) => r.product.category === settings.attach.category)
  const rateBp = tier ? tier.rateBp + (attach ? settings.attach.bonusBp : 0) : 0
  const commissionCents = tier ? Math.max(0, applyBp(grossCents, rateBp)) : 0

  return {
    lines: rows,
    deliveryListCents,
    deliveryPriceCents,
    listToplineCents,
    toplineCents,
    savingsCents: listToplineCents - toplineCents,
    productCostCents,
    deliveryCostCents,
    financingAdjCents,
    grossCents,
    marginBp: marginBp(grossCents, toplineCents),
    tier,
    attach,
    rateBp,
    commissionCents,
    issues,
    ok: !issues.some((i) => i.level === 'block'),
  }
}

/** The smallest cut that isn't a lowball: the larger of the fixed amount and the percent. */
export function minStepCents(fromToplineCents: Cents, settings: Settings): Cents {
  return Math.max(settings.minStep.cents, applyBp(fromToplineCents, settings.minStep.pctBp))
}

/** A warning when a new offer cuts less than the minimum step from the last one. */
export function checkStep(prevToplineCents: Cents, nextToplineCents: Cents, settings: Settings) {
  const cut = prevToplineCents - nextToplineCents
  const min = minStepCents(prevToplineCents, settings)
  if (cut > 0 && cut < min) {
    return {
      level: 'warn' as const,
      cutCents: cut,
      minCents: min,
      message: `That's only ${formatMoney(cut)} off. A cut under ${formatMoney(min)} can feel like a lowball and insult the customer.`,
    }
  }
  return null
}

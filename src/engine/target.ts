import type { Cents } from './money'
import { evaluate, financingAdjustment, isLocked, priceCost } from './evaluate'
import type { Ctx } from './evaluate'
import { baseDeal, lowestPriceAtMargin } from './solve'
import type { Strategy } from './solve'
import type { Deal, DealLine, Evaluation, Product, Tier } from './types'

export interface Way {
  id: Strategy | 'bundle-deal'
  title: string
  how: string
  deal: Deal
  ev: Evaluation
}

export type Lever =
  | { kind: 'floor-model'; lineId: string; product: Product; toplineCents: Cents; lowerByCents: Cents; deal: Deal; ev: Evaluation }
  | { kind: 'financing'; months: number; toplineCents: Cents; lowerByCents: Cents; deal: Deal; ev: Evaluation }
  | {
      kind: 'add-on'
      product: Product
      toplineCents: Cents
      /** What the customer pays for everything except the add-on. */
      restToplineCents: Cents
      lowerByCents: Cents
      deal: Deal
      ev: Evaluation
    }

export interface TargetResult {
  tier: Tier
  /** False when no price move gets there: only the levers can. */
  reachable: boolean
  lowestToplineCents: Cents | null
  ways: Way[]
  levers: Lever[]
}

const WAY_TEXT: Record<Way['id'], { title: string; how: string }> = {
  'main-item': {
    title: 'Discount the mattress',
    how: 'The whole discount comes off the main item; everything else stays at full price.',
  },
  spread: {
    title: 'A little off everything',
    how: 'The discount is shared by every item that can be discounted, by how much room each one has.',
  },
  'delivery-first': {
    title: 'Discounted delivery + mattress',
    how: 'Delivery drops to its lowest allowed price first, and the mattress covers the rest.',
  },
  'bundle-deal': {
    title: 'Use the bundle deals',
    how: 'The store deals (like the second pillow half off) do part of the work, and the mattress covers the rest.',
  },
}

const ADD_ON_CATEGORIES = new Set(['pillow', 'protector', 'sheets', 'adjustable-base'])

/**
 * "I want to sell all of this and stay in the middle tier": the lowest price
 * that holds a tier, a few ways to present it, and the levers that would go lower.
 */
export function waysToTarget(deal: Deal, tierId: string, ctx: Ctx, products: Product[]): TargetResult {
  const tier = ctx.settings.tiers.find((t) => t.id === tierId)
  if (!tier) throw new Error(`Unknown tier ${tierId}`)
  const base = baseDeal(deal, ctx)
  const target = tier.minMarginBp

  // Ways that only move prices all land on the same lowest price; they differ in
  // where the discount sits, which changes how the customer hears it.
  const ways: Way[] = []
  const seen = new Set<string>()
  const tryWay = (id: Way['id'], start: Deal, strategy: Strategy) => {
    const p = lowestPriceAtMargin(start, target, strategy, ctx)
    if (!p) return
    const key = JSON.stringify([p.deal.lines.map((l) => l.discountCents), p.deal.delivery, p.deal.bundleDealIds])
    if (seen.has(key)) return
    seen.add(key)
    ways.push({ id, ...WAY_TEXT[id], deal: p.deal, ev: p.ev })
  }
  tryWay('main-item', base, 'main-item')
  const unused = ctx.settings.bundleDeals
    .filter((d) => !base.bundleDealIds.includes(d.id))
    .map((d) => d.id)
  if (unused.length) {
    const withDeals = { ...base, bundleDealIds: [...base.bundleDealIds, ...unused] }
    const ev = evaluate(withDeals, ctx)
    // Only worth listing when a deal actually applies to something in the bundle.
    if (ev.lines.some((l) => l.promoCents > 0)) tryWay('bundle-deal', withDeals, 'main-item')
  }
  tryWay('delivery-first', base, 'delivery-first')
  tryWay('spread', base, 'spread')

  const lowest = ways.length ? Math.min(...ways.map((w) => w.ev.toplineCents)) : null
  const reference = lowest ?? evaluate(base, ctx).toplineCents
  const levers: Lever[] = []

  // Floor models cost the store less, so the same margin allows a lower price.
  for (const line of base.lines) {
    const product = ctx.catalog.get(line.sku)
    if (!product?.floor || line.condition !== 'new') continue
    const swapped: Deal = {
      ...base,
      lines: base.lines.map((l) => (l.id === line.id ? { ...l, condition: 'floor' as const } : l)),
    }
    const p = lowestPriceAtMargin(swapped, target, 'main-item', ctx)
    if (p && p.ev.toplineCents < reference) {
      levers.push({
        kind: 'floor-model',
        lineId: line.id,
        product,
        toplineCents: p.ev.toplineCents,
        lowerByCents: reference - p.ev.toplineCents,
        deal: p.deal,
        ev: p.ev,
      })
    }
  }

  // Financing terms that add gross dollars make room for a lower price.
  const baseEv = evaluate(base, ctx)
  for (const months of ctx.settings.financing.terms) {
    if (months === base.financingMonths) continue
    const adj = financingAdjustment(ctx.settings, months, baseEv.toplineCents)
    if (adj === null || adj <= baseEv.financingAdjCents) continue
    const p = lowestPriceAtMargin({ ...base, financingMonths: months }, target, 'main-item', ctx)
    if (p && p.ev.toplineCents < reference) {
      levers.push({
        kind: 'financing',
        months,
        toplineCents: p.ev.toplineCents,
        lowerByCents: reference - p.ev.toplineCents,
        deal: p.deal,
        ev: p.ev,
      })
    }
  }

  // A full-price add-on with a strong margin lifts the whole bundle, so the rest
  // can go lower, or a bundle that couldn't reach the tier now can (how a
  // price-locked premium bed still gets a deal).
  const reachable = ways.length > 0
  const inDeal = new Set(base.lines.map((l) => l.sku))
  const dealProducts = base.lines.map((l) => ctx.catalog.get(l.sku)).filter((p) => p !== undefined)
  const categoriesInDeal = new Set(dealProducts.map((p) => p.category))
  // Sizes of the beds in the deal: a King protector doesn't go on a Queen bed.
  const bedSizes = new Set(
    dealProducts.filter((p) => p.category === 'mattress' || p.category === 'adjustable-base').map((p) => p.size),
  )
  const addOns: Extract<Lever, { kind: 'add-on' }>[] = []
  for (const product of products) {
    if (!ADD_ON_CATEGORIES.has(product.category) || inDeal.has(product.sku)) continue
    // One of each kind per bed (pillows excepted: people buy more than one).
    if (product.category !== 'pillow' && categoriesInDeal.has(product.category)) continue
    if (product.category !== 'pillow' && product.size && bedSizes.size && !bedSizes.has(product.size)) continue
    if (isLocked(product, ctx.settings)) continue
    const pc = priceCost(product, 'new')!
    if ((pc.listCents - pc.costCents) * 10_000 < target * pc.listCents) continue
    const line: DealLine = { id: `addon-${product.sku}`, sku: product.sku, condition: 'new', qty: 1, discountCents: 0 }
    const p = lowestPriceAtMargin({ ...base, lines: [...base.lines, line] }, target, 'main-item', ctx)
    if (!p) continue
    const addOnLine = p.ev.lines.find((l) => l.lineId === line.id)
    if (!addOnLine || addOnLine.discountCents !== 0) continue
    const rest = p.ev.toplineCents - addOnLine.netCents
    const lowerBy = reference - rest
    if (reachable ? lowerBy > 0 : true) {
      addOns.push({ kind: 'add-on', product, toplineCents: p.ev.toplineCents, restToplineCents: rest, lowerByCents: Math.max(0, lowerBy), deal: p.deal, ev: p.ev })
    }
  }
  addOns.sort((a, b) => b.lowerByCents - a.lowerByCents || b.ev.marginBp - a.ev.marginBp)
  levers.push(...addOns.slice(0, 2))

  return {
    tier,
    reachable,
    lowestToplineCents: lowest,
    ways: ways.slice(0, 3),
    levers,
  }
}

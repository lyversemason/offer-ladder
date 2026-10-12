import { BP, applyBp, meetsMargin, roundUpTo } from './money'
import type { Bp, Cents } from './money'
import { evaluate } from './evaluate'
import type { Ctx } from './evaluate'
import type { Deal, Evaluation, LineResult } from './types'

/**
 * Where a discount on the whole ticket goes:
 * - spread: across every item that can be discounted and delivery, in proportion
 *   to each one's price, so they all take the same share off
 * - main-item: the mattress first, the rest only if the mattress runs out of room
 * - delivery-first: delivery down to its minimum, then the mattress, then the rest
 */
export type Strategy = 'spread' | 'main-item' | 'delivery-first'

export interface Priced {
  deal: Deal
  ev: Evaluation
  /** True when everything this strategy can move is at $0 (or delivery's minimum). */
  limited: boolean
}

/** The same deal with every rep discount removed and delivery at full price. */
export function baseDeal(deal: Deal, ctx: Ctx): Deal {
  const tier = deal.delivery
    ? ctx.settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId)
    : undefined
  return {
    ...deal,
    lines: deal.lines.map((l) => ({ ...l, discountCents: 0 })),
    delivery: deal.delivery
      ? { tierId: deal.delivery.tierId, priceCents: tier?.priceCents ?? deal.delivery.priceCents }
      : null,
  }
}

/**
 * Room a line has to come down: all the way to $0 (one item may sell below its
 * cost, even free; the ticket as a whole has to make money). None if it's price-locked.
 */
function lineRoom(r: LineResult): Cents {
  return r.locked ? 0 : Math.max(0, r.netCents)
}

function deliveryRoom(deal: Deal, ctx: Ctx): Cents {
  if (!deal.delivery) return 0
  const tier = ctx.settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId)
  return tier ? Math.max(0, deal.delivery.priceCents - tier.minPriceCents) : 0
}

const DELIVERY = '__delivery__'

/** Splits an amount across items in proportion to their room, exactly to the cent. */
function splitByRoom(amount: Cents, rooms: { id: string; room: Cents }[]): Map<string, Cents> {
  const out = new Map<string, Cents>()
  const total = rooms.reduce((s, r) => s + r.room, 0)
  if (amount <= 0 || total <= 0) return out
  const take = Math.min(amount, total)
  let given = 0
  for (const r of rooms) {
    const share = Math.floor((take * r.room) / total)
    out.set(r.id, share)
    given += share
  }
  // The leftover cents (fewer than the number of items) go one each to the
  // items with the most room, never past an item's room.
  const byRoom = [...rooms].sort((a, b) => b.room - a.room)
  for (let i = 0; given < take; i = (i + 1) % byRoom.length) {
    const r = byRoom[i]
    const cur = out.get(r.id) ?? 0
    if (cur < r.room) {
      out.set(r.id, cur + 1)
      given++
    }
  }
  return out
}

/** The categories treated as "the main item" for the main-item strategy. */
const MAIN_CATEGORIES = new Set(['mattress'])

/**
 * Takes a total discount (in cents) off a deal, on top of any discounts it
 * already has, using a strategy. Never goes below $0 on an item or below a
 * delivery tier's minimum, and never touches price-locked items. Returns the new
 * deal and how much of the discount actually fit.
 */
export function distribute(
  deal: Deal,
  discountCents: Cents,
  strategy: Strategy,
  ctx: Ctx,
): { deal: Deal; appliedCents: Cents } {
  const ev = evaluate(deal, ctx)
  let left = Math.max(0, discountCents)
  const extra = new Map<string, Cents>()
  const take = (pool: { id: string; room: Cents }[]) => {
    if (left <= 0) return
    for (const [id, cents] of splitByRoom(left, pool)) {
      extra.set(id, (extra.get(id) ?? 0) + cents)
      left -= cents
    }
  }
  const delivery = { id: DELIVERY, room: deliveryRoom(deal, ctx) }
  const rows = ev.lines.filter((r) => lineRoom(r) > 0)
  const room = (rs: LineResult[]) => rs.map((r) => ({ id: r.lineId, room: lineRoom(r) }))

  if (strategy === 'spread') {
    take([...room(rows), delivery])
  } else {
    if (strategy === 'delivery-first') take([delivery])
    let main = rows.filter((r) => MAIN_CATEGORIES.has(r.product.category))
    if (main.length === 0 && rows.length > 0) {
      // No discountable mattress: the most expensive discountable item is the main one.
      main = [[...rows].sort((a, b) => b.netCents - a.netCents)[0]]
    }
    take(room(main))
    take([...room(rows.filter((r) => !main.includes(r))), ...(strategy === 'main-item' ? [delivery] : [])])
  }

  const out: Deal = {
    ...deal,
    lines: deal.lines.map((l) => ({ ...l, discountCents: l.discountCents + (extra.get(l.id) ?? 0) })),
    delivery: deal.delivery
      ? { ...deal.delivery, priceCents: deal.delivery.priceCents - (extra.get(DELIVERY) ?? 0) }
      : null,
  }
  return { deal: out, appliedCents: Math.max(0, discountCents) - left }
}

/**
 * Gives back part of the discounts a deal already has (the price goes up), in
 * proportion to how much is off each item and delivery.
 */
function giveBack(deal: Deal, cents: Cents, ctx: Ctx): { deal: Deal; appliedCents: Cents } {
  const ev = evaluate(deal, ctx)
  const tier = deal.delivery ? ctx.settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId) : undefined
  const pool = [
    ...ev.lines.filter((r) => !r.locked).map((r) => ({ id: r.lineId, room: Math.max(0, r.discountCents) })),
    { id: DELIVERY, room: tier && deal.delivery ? Math.max(0, tier.priceCents - deal.delivery.priceCents) : 0 },
  ]
  const back = splitByRoom(cents, pool)
  const applied = [...back.values()].reduce((s, c) => s + c, 0)
  return {
    deal: {
      ...deal,
      lines: deal.lines.map((l) => ({ ...l, discountCents: l.discountCents - (back.get(l.id) ?? 0) })),
      delivery: deal.delivery
        ? { ...deal.delivery, priceCents: deal.delivery.priceCents + (back.get(DELIVERY) ?? 0) }
        : null,
    },
    appliedCents: applied,
  }
}

/** Price checks that matter when searching for an offer (not catalog mistakes). */
function priceOk(ev: Evaluation, targetBp: Bp): boolean {
  return (
    meetsMargin(ev.grossCents, ev.toplineCents, targetBp) &&
    !ev.issues.some((i) => i.code === 'financing-unavailable')
  )
}

/**
 * The lowest customer price that keeps the deal at or above a target margin,
 * moving prices only (costs stay put). Uses the discount formula
 *   D = (gross − target × topline) ÷ (1 − target)
 * then rounds the price up to a nice number and re-checks with the full engine.
 * Returns null when even the starting price is below the target.
 */
export function lowestPriceAtMargin(
  base: Deal,
  targetBp: Bp,
  strategy: Strategy,
  ctx: Ctx,
): Priced | null {
  const ev0 = evaluate(base, ctx)
  if (ev0.toplineCents <= 0 || !priceOk(ev0, targetBp)) return null
  const step = ctx.settings.roundToCents
  const t0 = ev0.toplineCents
  const grossBeforeFinancing = ev0.grossCents - ev0.financingAdjCents

  // Financing adds or subtracts gross by price band, so the formula is re-run
  // with the adjustment of the band the new price lands in (a few rounds at most).
  let adj = ev0.financingAdjCents
  const room = distribute(base, Number.MAX_SAFE_INTEGER, strategy, ctx).appliedCents
  let best: { deal: Deal; ev: Evaluation; applied: Cents; wanted: Cents } | null = null
  for (let round = 0; round < 6; round++) {
    const gross = grossBeforeFinancing + adj
    const maxD = Math.floor((gross * BP - targetBp * t0) / (BP - targetBp))
    // When the formula allows more than there is room for, everything that can
    // move goes to its cost (or minimum): no rounding, that's as low as it gets.
    const wanted =
      maxD >= room ? room : t0 - Math.min(t0, roundUpTo(t0 - Math.max(0, maxD), step))
    const { deal, appliedCents } = distribute(base, wanted, strategy, ctx)
    const ev = evaluate(deal, ctx)
    best = { deal, ev, applied: appliedCents, wanted }
    if (ev.financingAdjCents === adj) break
    adj = ev.financingAdjCents
  }

  // Double-check: nudge the price back up one step at a time until it passes.
  let { deal, ev, applied, wanted } = best!
  while (!priceOk(ev, targetBp) && applied > 0) {
    wanted = Math.max(0, applied - step)
    const next = distribute(base, wanted, strategy, ctx)
    deal = next.deal
    applied = next.appliedCents
    ev = evaluate(deal, ctx)
  }
  if (!priceOk(ev, targetBp)) return { deal: base, ev: ev0, limited: room === 0 }
  return { deal, ev, limited: applied >= room }
}

/**
 * Prices the whole ticket at one number ("$2,450 out the door"), starting from
 * the ticket as it is: a lower number takes more off, spread across everything
 * that can move; a higher one gives back part of what's already off. Returns
 * whether the whole change fit.
 */
export function priceBundleAt(deal: Deal, toplineCents: Cents, strategy: Strategy, ctx: Ctx) {
  const now = evaluate(deal, ctx).toplineCents
  const change = now - toplineCents
  const { deal: priced, appliedCents } =
    change >= 0 ? distribute(deal, change, strategy, ctx) : giveBack(deal, -change, ctx)
  return { deal: priced, ev: evaluate(priced, ctx), fits: appliedCents === Math.abs(change) }
}

/**
 * What can still come off the ticket: every item that isn't price-locked down to
 * $0, and delivery down to its minimum.
 */
export function movableCents(deal: Deal, ctx: Ctx): Cents {
  const ev = evaluate(deal, ctx)
  return ev.lines.filter((r) => !r.locked).reduce((s, r) => s + lineRoom(r), 0) + deliveryRoom(deal, ctx)
}

/** The ticket's price after taking a percent off everything that can move. */
export function toplineAfterPctOff(deal: Deal, pctBp: Bp, ctx: Ctx): Cents {
  return evaluate(deal, ctx).toplineCents - applyBp(movableCents(deal, ctx), pctBp)
}

/** A price the store can sell at: it makes money, and its financing (if any) is offered. */
export function sellable(ev: Evaluation): boolean {
  return ev.tier !== null && !ev.issues.some((i) => i.code === 'financing-unavailable')
}

/**
 * The lowest whole-ticket price the store can still sell at (it makes a little
 * money), spreading the discount the same way priceBundleAt does. Exact to the
 * cent. Null for an empty ticket, or one that can't make money even at full price.
 */
export function lowestTotal(deal: Deal, ctx: Ctx): Cents | null {
  const base = baseDeal(deal, ctx)
  const top = evaluate(base, ctx)
  if (top.toplineCents <= 0 || !sellable(top)) return null
  return lowestPassing(0, top.toplineCents, (cents) => {
    const p = priceBundleAt(base, cents, 'spread', ctx)
    return p.fits && sellable(p.ev)
  })
}

/**
 * The lowest price for one line (or delivery, with lineId null) that keeps the
 * ticket sellable, with everything else as it is. Null when even full price
 * isn't enough.
 */
export function lowestLinePrice(deal: Deal, lineId: string | null, ctx: Ctx): Cents | null {
  const ev = evaluate(deal, ctx)
  const set = (cents: Cents): Deal =>
    lineId === null
      ? { ...deal, delivery: deal.delivery ? { ...deal.delivery, priceCents: cents } : null }
      : { ...deal, lines: deal.lines.map((l) => {
          const r = ev.lines.find((x) => x.lineId === l.id)
          return l.id === lineId && r ? { ...l, discountCents: r.listCents - cents } : l
        }) }
  let full: Cents
  if (lineId === null) {
    const tier = deal.delivery ? ctx.settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId) : undefined
    if (!tier) return null
    full = tier.priceCents
  } else {
    const r = ev.lines.find((x) => x.lineId === lineId)
    if (!r) return null
    full = r.listCents
  }
  if (!sellable(evaluate(set(full), ctx))) return null
  return lowestPassing(0, full, (cents) => sellable(evaluate(set(cents), ctx)))
}

/** Binary search: the lowest cents in [lo, hi] that passes, given hi passes and passing only gets easier going up. */
function lowestPassing(lo: Cents, hi: Cents, passes: (cents: Cents) => boolean): Cents {
  if (passes(lo)) return lo
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (passes(mid)) hi = mid
    else lo = mid
  }
  return hi
}

export interface TierRoom {
  /** The lowest price that still keeps the current tier (null when below the floor). */
  lowestInTierCents: Cents | null
  /** How much lower the rep can go and stay in this tier. */
  canGoLowerCents: Cents
  /** The tier above and the price that gets back into it (null if already top, or out of reach). */
  nextUp: { tierId: string; label: string; toplineCents: Cents; raiseCents: Cents } | null
}

/** How much room the current price has in its tier, and what it takes to move up one. */
export function tierRoom(deal: Deal, ctx: Ctx): TierRoom {
  const ev = evaluate(deal, ctx)
  const base = baseDeal(deal, ctx)
  const { tiers } = ctx.settings
  let lowestInTierCents: Cents | null = null
  let canGoLowerCents = 0
  if (ev.tier) {
    const p = lowestPriceAtMargin(base, ev.tier.minMarginBp, 'spread', ctx)
    if (p) {
      lowestInTierCents = p.ev.toplineCents
      canGoLowerCents = Math.max(0, ev.toplineCents - p.ev.toplineCents)
    }
  }
  const idx = ev.tier ? tiers.findIndex((t) => t.id === ev.tier!.id) : tiers.length
  let nextUp: TierRoom['nextUp'] = null
  if (idx > 0 && ev.toplineCents > 0) {
    const up = tiers[idx - 1]
    const p = lowestPriceAtMargin(base, up.minMarginBp, 'spread', ctx)
    if (p && p.ev.toplineCents > ev.toplineCents) {
      nextUp = { tierId: up.id, label: up.label, toplineCents: p.ev.toplineCents, raiseCents: p.ev.toplineCents - ev.toplineCents }
    }
  }
  return { lowestInTierCents, canGoLowerCents, nextUp }
}

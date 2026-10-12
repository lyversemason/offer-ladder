import type { Bp, Cents } from './money'
import { evaluate, minStepCents } from './evaluate'
import type { Ctx } from './evaluate'
import { baseDeal, lowestPriceAtMargin } from './solve'
import type { Strategy } from './solve'
import type { Deal, Evaluation, Tier } from './types'

export type RungKind = 'asking' | 'opening' | 'middle' | 'final'

export interface Rung {
  kind: RungKind
  /** "Asking price", "Offer 1", ... */
  label: string
  /** The tier this rung was aimed at (null for the asking price). */
  aimTier: Tier | null
  deal: Deal
  ev: Evaluation
  /** How much lower than the rung before. */
  stepCents: Cents
  /** Commission change from the rung before (zero or negative). */
  commissionChangeCents: Cents
}

export interface Ladder {
  rungs: Rung[]
  notes: string[]
  /**
   * The step where the customer saves the most per commission dollar the rep
   * gives up: the wide middle tier's sweet spot.
   */
  bestValueStep: { rungIndex: number; savesCents: Cents; costsCents: Cents } | null
}

export interface LadderOptions {
  strategy?: Strategy
  /** How many offers to make inside each middle tier (default 2). */
  offersPerMiddleTier?: number
}

interface Candidate {
  kind: RungKind
  aimTier: Tier
  targetBp: Bp
}

/**
 * Builds the sequence of offers: an opening offer that stays in the top tier,
 * real discounts through the middle tier(s), and a final offer at the floor.
 * Every step must be at least the minimum step, so no offer is a lowball.
 */
export function buildLadder(deal: Deal, ctx: Ctx, opts: LadderOptions = {}): Ladder {
  const strategy = opts.strategy ?? 'spread'
  const perMiddle = Math.max(1, opts.offersPerMiddleTier ?? 2)
  const { tiers } = ctx.settings
  const base = baseDeal(deal, ctx)
  const ev0 = evaluate(base, ctx)
  const notes: string[] = []

  const asking: Rung = {
    kind: 'asking',
    label: 'Asking price',
    aimTier: null,
    deal: base,
    ev: ev0,
    stepCents: 0,
    commissionChangeCents: 0,
  }
  if (ev0.toplineCents <= 0) return { rungs: [], notes, bestValueStep: null }
  if (!ev0.tier) {
    notes.push('Even the asking price is below the margin floor, so there is no room to negotiate.')
    return { rungs: [asking], notes, bestValueStep: null }
  }

  const candidates: Candidate[] = []
  const last = tiers.length - 1
  tiers.forEach((tier, i) => {
    if (i === 0) {
      candidates.push({ kind: 'opening', aimTier: tier, targetBp: tier.minMarginBp })
    } else if (i < last) {
      // Spread the offers evenly down the middle tier, ending at its bottom.
      const top = tiers[i - 1].minMarginBp
      for (let s = 1; s <= perMiddle; s++) {
        const bp = Math.round(top - ((top - tier.minMarginBp) * s) / perMiddle)
        candidates.push({ kind: 'middle', aimTier: tier, targetBp: bp })
      }
    } else {
      candidates.push({ kind: 'final', aimTier: tier, targetBp: tier.minMarginBp })
    }
  })

  const priced = candidates
    .map((c) => ({ c, p: lowestPriceAtMargin(base, c.targetBp, strategy, ctx) }))
    .filter((x) => x.p !== null)

  // Keep a rung only if it's a meaningful step below the last one kept.
  const kept: { c: Candidate; ev: Evaluation; deal: Deal }[] = []
  const lastTopline = () => (kept.length ? kept[kept.length - 1].ev.toplineCents : ev0.toplineCents)
  const bigEnough = (from: Cents, to: Cents) => from - to >= minStepCents(from, ctx.settings)
  for (const { c, p } of priced) {
    if (c.kind === 'final') continue
    if (bigEnough(lastTopline(), p!.ev.toplineCents)) kept.push({ c, ev: p!.ev, deal: p!.deal })
  }
  const final = priced.find((x) => x.c.kind === 'final')
  if (final) {
    // The final offer always stays; drop earlier rungs that crowd it.
    while (kept.length && !bigEnough(lastTopline(), final.p!.ev.toplineCents)) kept.pop()
    if (bigEnough(lastTopline(), final.p!.ev.toplineCents)) {
      kept.push({ c: final.c, ev: final.p!.ev, deal: final.p!.deal })
    }
  }

  if (!kept.some((k) => k.c.kind === 'opening') && ev0.tier.id === tiers[0].id) {
    notes.push(
      'The asking price is already close to the bottom of the top tier, so the first real offer drops into the next tier.',
    )
  }
  if (ev0.tier.id !== tiers[0].id) {
    notes.push(`The asking price is already in the ${ev0.tier.label.toLowerCase()} tier.`)
  }
  if (kept.length === 0) {
    notes.push('There is less than one minimum step between the asking price and the floor.')
  }
  if (final?.p?.limited) {
    notes.push('Every item that can be discounted is at its cost on the final offer.')
  }

  const rungs: Rung[] = [asking]
  kept.forEach((k, i) => {
    const prev = rungs[rungs.length - 1]
    rungs.push({
      kind: k.c.kind,
      label: `Offer ${i + 1}`,
      aimTier: k.c.aimTier,
      deal: k.deal,
      ev: k.ev,
      stepCents: prev.ev.toplineCents - k.ev.toplineCents,
      commissionChangeCents: k.ev.commissionCents - prev.ev.commissionCents,
    })
  })

  // The step with the lowest commission cost per dollar the customer saves,
  // not counting the first drop into a new tier.
  let bestValueStep: Ladder['bestValueStep'] = null
  for (let i = 2; i < rungs.length; i++) {
    const r = rungs[i]
    if (r.ev.tier?.id !== rungs[i - 1].ev.tier?.id) continue
    const costs = -r.commissionChangeCents
    if (
      !bestValueStep ||
      costs / r.stepCents < bestValueStep.costsCents / bestValueStep.savesCents
    ) {
      bestValueStep = { rungIndex: i, savesCents: r.stepCents, costsCents: costs }
    }
  }

  return { rungs, notes, bestValueStep }
}

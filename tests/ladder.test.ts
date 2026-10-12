import { describe, expect, it } from 'vitest'
import { buildLadder, minStepCents, waysToTarget, evaluate, meetsMargin, distribute, baseDeal } from '../src/engine'
import { ctx, deal, line, products, settings, whiteGlove } from './fixtures'

describe('offer ladder for a mattress, pillow and delivery', () => {
  const d = deal([line('M1'), line('P2')], { delivery: whiteGlove })
  const ladder = buildLadder(d, ctx)
  const { rungs } = ladder

  it('starts at the asking price', () => {
    expect(rungs[0].kind).toBe('asking')
    expect(rungs[0].ev.toplineCents).toBe(199900 + 14900 + 14900)
  })

  it('opens in the top tier, works down the middle tier and ends at the floor', () => {
    expect(rungs.map((r) => r.kind)).toEqual(['asking', 'opening', 'middle', 'middle', 'final'])
    expect(rungs[1].ev.tier?.id).toBe('top')
    expect(rungs[2].ev.tier?.id).toBe('middle')
    expect(rungs[3].ev.tier?.id).toBe('middle')
    expect(rungs[4].ev.tier?.id).toBe('low')
  })

  it('never lowballs: every step is at least the minimum step', () => {
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].stepCents).toBe(rungs[i - 1].ev.toplineCents - rungs[i].ev.toplineCents)
      expect(rungs[i].stepCents).toBeGreaterThanOrEqual(minStepCents(rungs[i - 1].ev.toplineCents, settings))
    }
  })

  it('shows the commission given up at each step', () => {
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].commissionChangeCents).toBe(rungs[i].ev.commissionCents - rungs[i - 1].ev.commissionCents)
      expect(rungs[i].commissionChangeCents).toBeLessThanOrEqual(0)
    }
  })

  it('every offer passes the rules', () => {
    for (const r of rungs) expect(r.ev.ok).toBe(true)
  })

  it('finds the cheap step inside the wide middle tier', () => {
    const best = ladder.bestValueStep!
    expect(best).not.toBeNull()
    expect(rungs[best.rungIndex].ev.tier?.id).toBe('middle')
    // Dropping into the middle tier costs far more per dollar than the step inside it.
    const drop = rungs[2]
    expect(best.costsCents / best.savesCents).toBeLessThan(-drop.commissionChangeCents / drop.stepCents)
  })

  it('numbers the offers', () => {
    expect(rungs.slice(1).map((r) => r.label)).toEqual(['Offer 1', 'Offer 2', 'Offer 3', 'Offer 4'])
  })
})

describe('ladder edge cases', () => {
  it('has no opening offer when the asking price is already in the middle tier', () => {
    const ladder = buildLadder(deal([line('MK'), line('B1')]), ctx)
    expect(ladder.rungs.some((r) => r.kind === 'opening')).toBe(false)
    expect(ladder.notes.join(' ')).toMatch(/already in the middle tier/)
  })

  it('makes no offers when there is less than one step of room', () => {
    const ladder = buildLadder(deal([line('P1')]), ctx)
    expect(ladder.rungs).toHaveLength(1)
    expect(ladder.notes.join(' ')).toMatch(/less than one minimum step/)
  })

  it('is empty for an empty deal', () => {
    expect(buildLadder(deal([]), ctx).rungs).toEqual([])
  })

  it('ignores discounts already typed in and starts from the asking price', () => {
    const ladder = buildLadder(deal([line('M1', { discountCents: 30000 })]), ctx)
    expect(ladder.rungs[0].ev.toplineCents).toBe(199900)
  })

  it('can make one offer per middle tier', () => {
    const ladder = buildLadder(deal([line('M1'), line('P2')], { delivery: whiteGlove }), ctx, { offersPerMiddleTier: 1 })
    expect(ladder.rungs.filter((r) => r.kind === 'middle')).toHaveLength(1)
  })
})

describe('target: stay in the middle tier', () => {
  const d = deal([line('M1'), line('PR1')], { delivery: whiteGlove })
  const result = waysToTarget(d, 'middle', ctx, products)

  it('finds a few different ways', () => {
    expect(result.reachable).toBe(true)
    expect(result.ways.length).toBeGreaterThanOrEqual(2)
    expect(result.ways.length).toBeLessThanOrEqual(3)
    const shapes = result.ways.map((w) => JSON.stringify([w.deal.lines.map((l) => l.discountCents), w.deal.delivery, w.deal.bundleDealIds]))
    expect(new Set(shapes).size).toBe(result.ways.length)
  })

  it('every way lands on the same lowest price, in the middle tier', () => {
    for (const w of result.ways) {
      expect(w.ev.toplineCents).toBe(result.lowestToplineCents)
      expect(w.ev.tier?.id).toBe('middle')
      expect(w.ev.ok).toBe(true)
    }
  })

  it('$10 lower would fall out of the tier', () => {
    const w = result.ways[0]
    const base = baseDeal(w.deal, ctx)
    const asking = evaluate(base, ctx).toplineCents
    const lower = distribute(base, asking - w.ev.toplineCents + 1000, 'spread', ctx)
    const ev = evaluate(lower.deal, ctx)
    expect(meetsMargin(ev.grossCents, ev.toplineCents, 4000)).toBe(false)
  })

  it('suggests the floor model, which really goes lower', () => {
    const lever = result.levers.find((l) => l.kind === 'floor-model')
    expect(lever).toBeDefined()
    expect(lever!.toplineCents).toBeLessThan(result.lowestToplineCents!)
    expect(lever!.ev.tier?.id).toBe('middle')
  })

  it('suggests a financing term that adds gross dollars', () => {
    const lever = result.levers.find((l) => l.kind === 'financing')
    expect(lever).toBeDefined()
    expect(lever!.ev.financingAdjCents).toBeGreaterThan(0)
    expect(lever!.toplineCents).toBeLessThan(result.lowestToplineCents!)
  })
})

describe('target with a price-locked premium item', () => {
  it('cannot reach a tier above the asking price by discounting', () => {
    const result = waysToTarget(deal([line('MK')]), 'top', ctx, products)
    expect(result.reachable).toBe(false)
    expect(result.lowestToplineCents).toBeNull()
    expect(result.ways).toEqual([])
  })

  it('suggests a full-price add-on that lets the rest of the bundle go lower', () => {
    const result = waysToTarget(deal([line('MK'), line('B1')]), 'middle', ctx, products)
    const addOn = result.levers.find((l) => l.kind === 'add-on')
    expect(addOn).toBeDefined()
    if (addOn?.kind !== 'add-on') return
    expect(addOn.lowerByCents).toBeGreaterThan(0)
    expect(addOn.ev.tier?.id).toBe('middle')
    expect(addOn.deal.lines.find((l) => l.sku === 'MK')?.discountCents).toBe(0)
  })

  it('rejects an unknown tier', () => {
    expect(() => waysToTarget(deal([line('M1')]), 'platinum', ctx, products)).toThrow()
  })
})

describe('add-on suggestions make sense', () => {
  it('never suggests a second item of a kind already in the deal, or the wrong size', () => {
    const extra = [
      ...products,
      { sku: 'PR-K', brand: 'Alder', model: 'Dry Protector', category: 'protector' as const, size: 'King', listCents: 14900, costCents: 3000 },
      { sku: 'SH-K', brand: 'Alder', model: 'Sheets', category: 'sheets' as const, size: 'King', listCents: 14900, costCents: 3000 },
      { sku: 'SH-Q', brand: 'Alder', model: 'Sheets', category: 'sheets' as const, size: 'Queen', listCents: 14900, costCents: 3000 },
    ]
    const c = { ...ctx, catalog: new Map(extra.map((p) => [p.sku, p])) }
    const result = waysToTarget(deal([line('M1'), line('PR1')]), 'middle', c, extra)
    const suggested = result.levers.filter((l) => l.kind === 'add-on').map((l) => (l.kind === 'add-on' ? l.product.sku : ''))
    expect(suggested).not.toContain('PR-K')
    expect(suggested).not.toContain('SH-K')
    expect(suggested).toContain('SH-Q')
  })
})

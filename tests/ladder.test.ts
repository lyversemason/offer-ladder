import { describe, expect, it } from 'vitest'
import { buildLadder, minStepCents } from '../src/engine'
import { ctx, deal, line, whiteGlove } from './fixtures'

// The ladder only drives the made-up history's reps now; the app itself doesn't suggest offers.
describe('simulated offer ladder for a mattress, pillow and delivery', () => {
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
      expect(rungs[i].stepCents).toBeGreaterThanOrEqual(minStepCents(rungs[i - 1].ev.toplineCents))
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

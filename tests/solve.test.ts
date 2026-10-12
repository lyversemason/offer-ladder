import { describe, expect, it } from 'vitest'
import { baseDeal, distribute, evaluate, lowestPriceAtMargin, meetsMargin } from '../src/engine'
import type { Deal, Strategy } from '../src/engine'
import { ctx, deal, line, products, seeded, settings, whiteGlove } from './fixtures'

describe('the discount formula', () => {
  it('finds the lowest price that holds 50% on one mattress', () => {
    // D = (1100.00 − 0.5 × 1999.00) ÷ 0.5 = 201.00 → $1,798, rounded up to $1,800
    const p = lowestPriceAtMargin(deal([line('M1')]), 5000, 'spread', ctx)!
    expect(p.ev.toplineCents).toBe(180000)
    expect(p.ev.tier?.id).toBe('top')
    expect(p.limited).toBe(false)
  })

  it('returns null when the starting price is already below the target', () => {
    expect(lowestPriceAtMargin(deal([line('MK')]), 5000, 'spread', ctx)).toBeNull()
  })

  it('cannot discount a bundle of only price-locked items', () => {
    const p = lowestPriceAtMargin(deal([line('MK')]), 4000, 'spread', ctx)!
    expect(p.ev.toplineCents).toBe(349900)
    expect(p.limited).toBe(true)
  })

  it('keeps the asking price when rounding would go above it', () => {
    // $1,999.00 rounds up to $2,000, which is above the asking price.
    const p = lowestPriceAtMargin(deal([line('M1')]), 5500, 'spread', ctx)!
    expect(p.ev.toplineCents).toBe(199900)
  })

  it('stops at cost when the target is below what cost allows', () => {
    const p = lowestPriceAtMargin(deal([line('M1'), line('MK')]), 0, 'spread', ctx)!
    expect(p.limited).toBe(true)
    expect(p.ev.lines.find((l) => l.product.sku === 'M1')?.netCents).toBe(89900)
    expect(p.ev.ok).toBe(true)
  })
})

describe('distribute', () => {
  const base = baseDeal(deal([line('M1'), line('P2'), line('MK')], { delivery: whiteGlove }), ctx)

  it('applies the exact amount, to the cent', () => {
    const { deal: d, appliedCents } = distribute(base, 12345, 'spread', ctx)
    expect(appliedCents).toBe(12345)
    expect(d.lines.reduce((s, l) => s + l.discountCents, 0)).toBe(12345)
    expect(evaluate(d, ctx).toplineCents).toBe(evaluate(base, ctx).toplineCents - 12345)
  })

  it('never touches a price-locked item', () => {
    const { deal: d } = distribute(base, 50000, 'spread', ctx)
    expect(d.lines.find((l) => l.sku === 'MK')?.discountCents).toBe(0)
  })

  it('spreads by room above cost', () => {
    const { deal: d } = distribute(base, 11990, 'spread', ctx)
    // Room: M1 $1,100, P2 $99 → 11,990 splits 11,000 / 990
    expect(d.lines.find((l) => l.sku === 'M1')?.discountCents).toBe(11000)
    expect(d.lines.find((l) => l.sku === 'P2')?.discountCents).toBe(990)
  })

  it('main-item puts it all on the mattress first', () => {
    const { deal: d } = distribute(base, 20000, 'main-item', ctx)
    expect(d.lines.find((l) => l.sku === 'M1')?.discountCents).toBe(20000)
    expect(d.lines.find((l) => l.sku === 'P2')?.discountCents).toBe(0)
  })

  it('delivery-first takes delivery to its minimum before anything else', () => {
    const { deal: d } = distribute(base, 10000, 'delivery-first', ctx)
    expect(d.delivery?.priceCents).toBe(7900)
    expect(d.lines.find((l) => l.sku === 'M1')?.discountCents).toBe(3000)
  })

  it('overflows to the rest when the main item runs out of room', () => {
    const { deal: d, appliedCents } = distribute(base, 115000, 'main-item', ctx)
    expect(d.lines.find((l) => l.sku === 'M1')?.discountCents).toBe(110000)
    expect(d.lines.find((l) => l.sku === 'P2')?.discountCents).toBe(5000)
    expect(appliedCents).toBe(115000)
  })

  it('reports how much fit when there is not enough room', () => {
    const { appliedCents } = distribute(base, 999999, 'spread', ctx)
    expect(appliedCents).toBe(110000 + 9900)
  })
})

describe('the lowest price is right for any deal (200 random deals)', () => {
  const rand = seeded(42)
  const skus = products.map((p) => p.sku)
  const strategies: Strategy[] = ['spread', 'main-item', 'delivery-first']
  const targets = [5000, 4500, 4000, 3400]

  const cases: { d: Deal; target: number; strategy: Strategy }[] = []
  for (let i = 0; i < 200; i++) {
    const lines = Array.from({ length: 1 + Math.floor(rand() * 4) }, () =>
      line(skus[Math.floor(rand() * skus.length)], { qty: 1 + Math.floor(rand() * 2) }),
    )
    const d = deal(lines, {
      delivery: rand() < 0.6 ? whiteGlove : null,
      financingMonths: rand() < 0.3 ? 12 : null,
      bundleDealIds: rand() < 0.3 ? ['pillow-2nd-half'] : [],
    })
    cases.push({
      d,
      target: targets[Math.floor(rand() * targets.length)],
      strategy: strategies[Math.floor(rand() * strategies.length)],
    })
  }

  it('always meets the target, passes every rule, and is a nice round price', () => {
    for (const { d, target, strategy } of cases) {
      const p = lowestPriceAtMargin(d, target, strategy, ctx)
      if (!p) continue
      expect(meetsMargin(p.ev.grossCents, p.ev.toplineCents, target)).toBe(true)
      expect(p.ev.ok).toBe(true)
      const asking = evaluate(baseDeal(d, ctx), ctx).toplineCents
      if (!p.limited && p.ev.toplineCents !== asking) {
        expect(p.ev.toplineCents % settings.roundToCents).toBe(0)
      }
    }
  })

  it('is the lowest: one more $10 off would break the target', () => {
    let checked = 0
    for (const { d, target, strategy } of cases) {
      const p = lowestPriceAtMargin(d, target, strategy, ctx)
      if (!p || p.limited) continue
      const base = baseDeal(d, ctx)
      const asking = evaluate(base, ctx).toplineCents
      const lower = distribute(base, asking - p.ev.toplineCents + settings.roundToCents, strategy, ctx)
      const ev = evaluate(lower.deal, ctx)
      const stillOk = meetsMargin(ev.grossCents, ev.toplineCents, target) && ev.ok
      // Financing can step up a band lower down; only check deals without it.
      if (d.financingMonths === null) {
        expect(stillOk).toBe(false)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })
})

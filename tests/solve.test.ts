import { describe, expect, it } from 'vitest'
import {
  baseDeal,
  distribute,
  evaluate,
  lowestLinePrice,
  lowestPriceAtMargin,
  lowestTotal,
  meetsMargin,
  movableCents,
  priceBundleAt,
  sellable,
  tierRoom,
  toplineAfterPctOff,
} from '../src/engine'
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

  it('goes all the way to $0 on an item when the target allows it (below cost is fine)', () => {
    const p = lowestPriceAtMargin(deal([line('M1'), line('MK')]), 0, 'spread', ctx)!
    expect(p.limited).toBe(true)
    expect(p.ev.lines.find((l) => l.product.sku === 'M1')?.netCents).toBe(0)
    expect(meetsMargin(p.ev.grossCents, p.ev.toplineCents, 0)).toBe(true)
  })
})

describe('distribute', () => {
  // Room: M1 $1,999 and P2 $149 down to $0, delivery $149 down to its $79 minimum, MK locked.
  const base = baseDeal(deal([line('M1'), line('P2'), line('MK')], { delivery: whiteGlove }), ctx)
  const off = (d: Deal, sku: string) => d.lines.find((l) => l.sku === sku)!.discountCents

  it('applies the exact amount, to the cent', () => {
    const { deal: d, appliedCents } = distribute(base, 12345, 'spread', ctx)
    expect(appliedCents).toBe(12345)
    expect(evaluate(d, ctx).toplineCents).toBe(evaluate(base, ctx).toplineCents - 12345)
  })

  it('never touches a price-locked item', () => {
    const { deal: d } = distribute(base, 50000, 'spread', ctx)
    expect(off(d, 'MK')).toBe(0)
  })

  it('spreads by price, delivery included: the same share off each', () => {
    // 10% of $1,999 + $149 + $70 of delivery room
    const { deal: d } = distribute(base, 22180, 'spread', ctx)
    expect(off(d, 'M1')).toBe(19990)
    expect(off(d, 'P2')).toBe(1490)
    expect(d.delivery?.priceCents).toBe(14900 - 700)
  })

  it('adds to the discounts already on the ticket', () => {
    const start: Deal = { ...base, lines: base.lines.map((l) => (l.sku === 'M1' ? { ...l, discountCents: 50000 } : l)) }
    const { deal: d } = distribute(start, 1000, 'main-item', ctx)
    expect(off(d, 'M1')).toBe(51000)
  })

  it('main-item puts it all on the mattress first', () => {
    const { deal: d } = distribute(base, 20000, 'main-item', ctx)
    expect(off(d, 'M1')).toBe(20000)
    expect(off(d, 'P2')).toBe(0)
  })

  it('delivery-first takes delivery to its minimum before anything else', () => {
    const { deal: d } = distribute(base, 10000, 'delivery-first', ctx)
    expect(d.delivery?.priceCents).toBe(7900)
    expect(off(d, 'M1')).toBe(3000)
  })

  it('overflows to the rest when the main item is free', () => {
    const { deal: d, appliedCents } = distribute(base, 210000, 'main-item', ctx)
    expect(off(d, 'M1')).toBe(199900)
    expect(off(d, 'P2') + (14900 - d.delivery!.priceCents)).toBe(10100)
    expect(appliedCents).toBe(210000)
  })

  it('reports how much fit when there is not enough room', () => {
    const { appliedCents } = distribute(base, 999999, 'spread', ctx)
    expect(appliedCents).toBe(199900 + 14900 + 7000)
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

describe('price the whole ticket at one number', () => {
  it('spreads the cut and hits the number exactly', () => {
    const r = priceBundleAt(deal([line('M1'), line('P2')]), 200000, 'spread', ctx)
    expect(r.ev.toplineCents).toBe(200000)
    expect(r.fits).toBe(true)
  })

  it('can take an item below its cost (the ticket check is separate)', () => {
    const r = priceBundleAt(deal([line('M1')]), 50000, 'spread', ctx)
    expect(r.fits).toBe(true)
    expect(r.ev.toplineCents).toBe(50000)
    expect(sellable(r.ev)).toBe(false)
  })

  it('says when price-locked items leave no room', () => {
    const r = priceBundleAt(deal([line('MK')]), 300000, 'spread', ctx)
    expect(r.fits).toBe(false)
    expect(r.ev.toplineCents).toBe(349900)
  })

  it("starts from the ticket as it is: a lower number keeps the rep's free delivery free", () => {
    const d = deal([line('M1'), line('P2')], { delivery: { tierId: 'white-glove', priceCents: 7900 } })
    const r = priceBundleAt(d, evaluate(d, ctx).toplineCents - 10000, 'spread', ctx)
    expect(r.fits).toBe(true)
    expect(r.deal.delivery?.priceCents).toBe(7900)
  })

  it('gives part of a discount back when the number is higher', () => {
    const r = priceBundleAt(deal([line('M1', { discountCents: 30000 })]), 180000, 'spread', ctx)
    expect(r.fits).toBe(true)
    expect(r.deal.lines[0].discountCents).toBe(19900)
  })

  it('cannot go above full price', () => {
    const r = priceBundleAt(deal([line('M1')]), 250000, 'spread', ctx)
    expect(r.fits).toBe(false)
    expect(r.ev.toplineCents).toBe(199900)
  })
})

describe('the lowest the ticket can go', () => {
  it('is exact to the cent: the lowest price that still clears the floor', () => {
    // (T − 899.00) ≥ 34% × T  →  T ≥ $1,362.12…, so $1,362.13
    const low = lowestTotal(deal([line('M1')]), ctx)!
    expect(low).toBe(136213)
    expect(sellable(priceBundleAt(deal([line('M1')]), low, 'spread', ctx).ev)).toBe(true)
    expect(sellable(priceBundleAt(deal([line('M1')]), low - 1, 'spread', ctx).ev)).toBe(false)
  })

  it('is the same wherever the rep has put the discounts so far', () => {
    const a = deal([line('M1'), line('P2')], { delivery: whiteGlove })
    const b = deal([line('M1', { discountCents: 40000 }), line('P2', { discountCents: 14900 })], { delivery: { tierId: 'white-glove', priceCents: 7900 } })
    expect(lowestTotal(a, ctx)).toBe(lowestTotal(b, ctx))
  })

  it('leaves price-locked items at list', () => {
    const low = lowestTotal(deal([line('MK'), line('P2')]), ctx)!
    expect(low).toBeGreaterThanOrEqual(349900)
  })

  it('is null for an empty ticket', () => {
    expect(lowestTotal(deal([]), ctx)).toBeNull()
  })
})

describe('the lowest one line can go', () => {
  it('holds everything else where it is', () => {
    // $1,999 + $149 of items costing $949: the mattress can go to $1,288.88
    const d = deal([line('M1'), line('P2')])
    const id = d.lines[0].id
    expect(lowestLinePrice(d, id, ctx)).toBe(143788 - 14900)
  })

  it('can be $0 when the rest of the ticket carries it', () => {
    const d = deal([line('M1'), line('P2')])
    expect(lowestLinePrice(d, d.lines[1].id, ctx)).toBe(0)
  })

  it('works for delivery too, never under its minimum', () => {
    const d = deal([line('M1')], { delivery: whiteGlove })
    expect(lowestLinePrice(d, null, ctx)).toBe(0)
  })
})

describe('percent off the whole ticket', () => {
  it('comes off everything that can move, not the locked items', () => {
    const d = deal([line('M1'), line('MK')], { delivery: whiteGlove })
    expect(movableCents(d, ctx)).toBe(199900 + 7000)
    expect(toplineAfterPctOff(d, 1000, ctx)).toBe(199900 + 349900 + 14900 - 20690)
  })
})

describe('room in the current tier', () => {
  it('says how much lower the rep can go and stay in the top tier', () => {
    const r = tierRoom(deal([line('M1')]), ctx)
    expect(r.lowestInTierCents).toBe(180000)
    expect(r.canGoLowerCents).toBe(19900)
    expect(r.nextUp).toBeNull()
  })

  it('says what it takes to get back up a tier', () => {
    const r = tierRoom(deal([line('M1', { discountCents: 30000 })]), ctx)
    expect(r.nextUp?.tierId).toBe('top')
    expect(r.nextUp?.toplineCents).toBe(180000)
    expect(r.nextUp?.raiseCents).toBe(180000 - 169900)
  })

  it('has no way up for a price-locked item stuck in the middle tier', () => {
    const r = tierRoom(deal([line('MK')]), ctx)
    expect(r.nextUp).toBeNull()
  })

  it('points back above the floor from below it', () => {
    const r = tierRoom(deal([line('M1', { discountCents: 63900 })]), ctx)
    expect(r.lowestInTierCents).toBeNull()
    expect(r.nextUp?.tierId).toBe('low')
  })
})

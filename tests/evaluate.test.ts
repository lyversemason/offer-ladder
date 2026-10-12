import { describe, expect, it } from 'vitest'
import { evaluate, financingAdjustment, makeCatalog, offBp, sizesFit, tierFor } from '../src/engine'
import type { Ctx, Product } from '../src/engine'
import { ctx, deal, line, products, settings, whiteGlove } from './fixtures'

const codes = (d: ReturnType<typeof evaluate>) => d.issues.map((i) => i.code)

describe('one mattress at list price', () => {
  const ev = evaluate(deal([line('M1')]), ctx)

  it('works out topline, gross and margin', () => {
    expect(ev.toplineCents).toBe(199900)
    expect(ev.grossCents).toBe(110000)
    expect(ev.marginBp).toBe(5502) // 55.02%
  })

  it('lands in the top tier and pays 15% of gross dollars, not of the price', () => {
    expect(ev.tier?.id).toBe('top')
    expect(ev.commissionCents).toBe(16500) // $165.00 = 15% of $1,100
  })

  it('has no issues', () => {
    expect(ev.issues).toEqual([])
    expect(ev.ok).toBe(true)
  })
})

describe('delivery', () => {
  it('adds the delivery price to the topline and takes the store cost out of gross', () => {
    const ev = evaluate(deal([line('M1')], { delivery: whiteGlove }), ctx)
    expect(ev.toplineCents).toBe(214800)
    expect(ev.deliveryCostCents).toBe(4500)
    expect(ev.grossCents).toBe(110000 + 14900 - 4500)
    expect(ev.commissionCents).toBe(18060)
  })

  it('still costs the store when delivery is free', () => {
    const ev = evaluate(deal([line('M1')], { delivery: { tierId: 'curbside', priceCents: 0 } }), ctx)
    expect(ev.toplineCents).toBe(199900)
    expect(ev.grossCents).toBe(110000 - 4500)
  })

  it('blocks delivery below its minimum price', () => {
    const ev = evaluate(deal([line('M1')], { delivery: { tierId: 'white-glove', priceCents: 7800 } }), ctx)
    expect(codes(ev)).toContain('delivery-below-min')
    expect(ev.ok).toBe(false)
  })

  it('allows delivery exactly at its minimum', () => {
    const ev = evaluate(deal([line('M1')], { delivery: { tierId: 'white-glove', priceCents: 7900 } }), ctx)
    expect(ev.ok).toBe(true)
  })

  it('blocks an unknown delivery option', () => {
    const ev = evaluate(deal([line('M1')], { delivery: { tierId: 'drone', priceCents: 0 } }), ctx)
    expect(codes(ev)).toContain('unknown-delivery')
  })
})

describe('attach bonus', () => {
  it('adds 2 points to the rate when the sale has an adjustable base', () => {
    const ev = evaluate(deal([line('M1'), line('B1')]), ctx)
    expect(ev.attach).toBe(true)
    expect(ev.tier?.id).toBe('top')
    expect(ev.rateBp).toBe(1700)
    expect(ev.grossCents).toBe(174900)
    expect(ev.commissionCents).toBe(29733) // 17% of $1,749.00
  })

  it('gives no bonus without one', () => {
    const ev = evaluate(deal([line('M1'), line('P1')]), ctx)
    expect(ev.attach).toBe(false)
    expect(ev.rateBp).toBe(1500)
  })
})

describe('tier lines', () => {
  it('counts exactly 50.00% as the top tier', () => {
    const ev = evaluate(deal([line('M1', { discountCents: 20100 })]), ctx)
    expect(ev.toplineCents).toBe(179800)
    expect(ev.grossCents).toBe(89900)
    expect(ev.tier?.id).toBe('top')
  })

  it('drops to the middle tier one cent lower (never rounds up into a tier)', () => {
    const ev = evaluate(deal([line('M1', { discountCents: 20101 })]), ctx)
    expect(ev.marginBp).toBe(4999)
    expect(ev.tier?.id).toBe('middle')
    expect(ev.rateBp).toBe(1100)
    expect(ev.commissionCents).toBe(9889) // 11% of $898.99 = $98.889 → $98.89
  })

  it('blocks a price below the floor and pays nothing', () => {
    const ev = evaluate(deal([line('M1', { discountCents: 63900 })]), ctx)
    expect(ev.marginBp).toBe(3389)
    expect(ev.tier).toBeNull()
    expect(ev.commissionCents).toBe(0)
    expect(codes(ev)).toContain('below-floor')
    expect(ev.issues.find((i) => i.code === 'below-floor')?.message).toMatch(/34% margin floor/)
  })

  it('tierFor returns null for an empty sale', () => {
    expect(tierFor(0, 0, settings.tiers)).toBeNull()
  })
})

describe('rules', () => {
  it('blocks any discount on a price-locked model', () => {
    const ev = evaluate(deal([line('MK', { discountCents: 100 })]), ctx)
    expect(codes(ev)).toContain('locked-discounted')
  })

  it('locks a model in any category, not only the premium mattresses', () => {
    const ev = evaluate(deal([line('M1'), line('PP', { discountCents: 500 })]), ctx)
    expect(codes(ev)).toContain('locked-discounted')
  })

  it('allows a price-locked item at list price', () => {
    const ev = evaluate(deal([line('MK')]), ctx)
    expect(ev.ok).toBe(true)
    expect(ev.tier?.id).toBe('middle') // 45.0%
  })

  it('lets one item go below its cost, even free, when the whole ticket still holds', () => {
    const ev = evaluate(deal([line('M1'), line('P1', { discountCents: 9900 })]), ctx)
    expect(ev.lines.find((l) => l.product.sku === 'P1')?.netCents).toBe(0)
    expect(ev.issues).toEqual([])
  })

  it('blocks a price below $0', () => {
    const ev = evaluate(deal([line('M1'), line('P1', { discountCents: 10000 })]), ctx)
    expect(codes(ev)).toContain('below-zero')
  })

  it('blocks a ticket priced under its total cost, even when every item looks fine alone', () => {
    const ev = evaluate(deal([line('M1', { discountCents: 110001 })]), ctx)
    expect(ev.grossCents).toBeLessThan(0)
    expect(codes(ev)).toContain('below-floor')
  })

  it('blocks a price above list', () => {
    const ev = evaluate(deal([line('M1', { discountCents: -100 })]), ctx)
    expect(codes(ev)).toContain('negative-discount')
  })

  it('refuses to guess an unknown product', () => {
    const ev = evaluate(deal([line('NOPE')]), ctx)
    expect(codes(ev)).toEqual(['unknown-sku'])
    expect(ev.toplineCents).toBe(0)
  })

  it('blocks a quantity that is not a whole number of 1 or more', () => {
    expect(codes(evaluate(deal([line('P1', { qty: 0 })]), ctx))).toContain('bad-qty')
    expect(codes(evaluate(deal([line('P1', { qty: 1.5 })]), ctx))).toContain('bad-qty')
  })

  it('blocks a condition the product is not sold in', () => {
    const ev = evaluate(deal([line('PR1', { condition: 'outlet' })]), ctx)
    expect(codes(ev)).toContain('condition-unavailable')
  })
})

describe('pairing rule', () => {
  // A Kestrel mattress only goes on a Kestrel foundation or base.
  const kestrelBase: Product = { sku: 'KB', modelSku: 'KB', brand: 'Kestrel', model: 'Kestrel Base', category: 'adjustable-base', size: 'Queen', listCents: 179900, costCents: 80000 }
  const paired: Ctx = {
    catalog: makeCatalog([...products, kestrelBase]),
    settings: { ...settings, pairing: [{ brand: 'Kestrel', supportBrands: ['Kestrel'] }] },
  }
  const check = (...skus: string[]) => codes(evaluate(deal(skus.map((s) => line(s))), paired))

  it('blocks a Kestrel mattress on another brand\'s base', () => {
    expect(check('MK', 'B1')).toContain('pairing')
    const ev = evaluate(deal([line('MK'), line('B1')]), paired)
    expect(ev.issues.find((i) => i.code === 'pairing')?.message).toMatch(/Swap the Alder Glide Base/)
  })

  it('allows a Kestrel mattress on a Kestrel base, or with no base at all', () => {
    expect(check('MK', 'KB')).not.toContain('pairing')
    expect(check('MK')).not.toContain('pairing')
  })

  it('lets any mattress go on a Kestrel base', () => {
    expect(check('M1', 'KB')).not.toContain('pairing')
  })

  it('allows the other brand\'s base when it can go under a second mattress', () => {
    expect(check('MK', 'M1', 'B1')).not.toContain('pairing')
  })
})

describe('sizes', () => {
  it('matches combined and split sizes to the bed they fit', () => {
    expect(sizesFit('King / Cal King', 'Cal King')).toBe(true)
    expect(sizesFit('Twin / Twin XL', 'Queen')).toBe(false)
    expect(sizesFit('King 1-piece', 'King')).toBe(true)
    expect(sizesFit('Split Cal King half', 'Cal King 1-piece')).toBe(true)
    expect(sizesFit('Queen', 'Queen')).toBe(true)
  })
})

describe('conditions', () => {
  it('uses the outlet price and cost', () => {
    const ev = evaluate(deal([line('M1', { condition: 'outlet' })]), ctx)
    expect(ev.toplineCents).toBe(149900)
    expect(ev.grossCents).toBe(89900)
    expect(ev.marginBp).toBe(5997)
  })

  it('multiplies price and cost by quantity', () => {
    const ev = evaluate(deal([line('P1', { qty: 3 })]), ctx)
    expect(ev.toplineCents).toBe(29700)
    expect(ev.productCostCents).toBe(9000)
  })
})

describe('sales tax', () => {
  it('is charged on the whole pre-tax total, delivery included', () => {
    const ev = evaluate(deal([line('M1'), line('P1', { discountCents: 900 })], { delivery: whiteGlove }), ctx)
    expect(ev.toplineCents).toBe(199900 + 9000 + 14900)
    expect(ev.taxCents).toBe(Math.round((199900 + 9000 + 14900) * 0.06))
    expect(ev.totalWithTaxCents).toBe(ev.toplineCents + ev.taxCents)
  })

  it('never changes gross, margin or commission', () => {
    const d = deal([line('M1')])
    const noTax = evaluate(d, { ...ctx, settings: { ...settings, salesTaxBp: 0 } })
    const taxed = evaluate(d, ctx)
    expect(noTax.taxCents).toBe(0)
    expect(taxed.grossCents).toBe(noTax.grossCents)
    expect(taxed.commissionCents).toBe(noTax.commissionCents)
  })

  it('is zero on an empty ticket', () => {
    expect(evaluate(deal([]), ctx).totalWithTaxCents).toBe(0)
  })
})

describe('percent off', () => {
  it('is the share of the price taken off', () => {
    expect(offBp(91881, 191880)).toBe(4788)
    expect(offBp(0, 1000)).toBe(0)
    expect(offBp(500, 0)).toBe(0)
  })
})

describe('financing', () => {
  it('adds gross dollars for a green term', () => {
    const ev = evaluate(deal([line('M1')], { financingMonths: 12 }), ctx)
    expect(ev.financingAdjCents).toBe(5000)
    expect(ev.grossCents).toBe(115000)
  })

  it('subtracts gross dollars for a red term', () => {
    const ev = evaluate(deal([line('M1')], { financingMonths: 36 }), ctx)
    expect(ev.financingAdjCents).toBe(-5000)
    expect(ev.grossCents).toBe(105000)
  })

  it('uses the band of the amount financed, edges included', () => {
    expect(financingAdjustment(settings, 12, 199900)).toBe(5000)
    expect(financingAdjustment(settings, 12, 199899)).toBe(2500)
    expect(financingAdjustment(settings, 12, 99900)).toBe(2500)
    expect(financingAdjustment(settings, 12, 99899)).toBe(0)
  })

  it('blocks a term not offered at that amount', () => {
    const ev = evaluate(deal([line('M1', { discountCents: 1 })], { financingMonths: 36 }), ctx)
    expect(codes(ev)).toContain('financing-unavailable')
    expect(ev.financingAdjCents).toBe(0)
  })

  it('blocks a term the store does not offer at all', () => {
    expect(financingAdjustment(settings, 6, 500000)).toBeNull()
    expect(codes(evaluate(deal([line('M1')], { financingMonths: 6 }), ctx))).toContain('financing-unavailable')
  })
})

describe('empty deal', () => {
  it('is zero everywhere with no issues', () => {
    const ev = evaluate(deal([]), ctx)
    expect(ev.toplineCents).toBe(0)
    expect(ev.tier).toBeNull()
    expect(ev.commissionCents).toBe(0)
    expect(ev.issues).toEqual([])
  })
})

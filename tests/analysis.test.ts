import { describe, expect, it } from 'vitest'
import { evaluate, gmAnalysis } from '../src/engine'
import { ctx, deal, line, whiteGlove } from './fixtures'

describe('GM calculator', () => {
  const ev = evaluate(
    deal([line('M1', { discountCents: 10000 }), line('P1', { qty: 2, discountCents: 19800 })], {
      delivery: whiteGlove,
      financingMonths: 12,
    }),
    ctx,
  )
  const gm = gmAnalysis(ev)

  it('shows each item with its selling price, cost, gross and margin', () => {
    const m1 = gm.rows.find((r) => r.lineId === ev.lines[0].lineId)!
    expect(m1).toMatchObject({ kind: 'item', sellingCents: 189900, costCents: 89900, grossCents: 100000 })
    expect(m1.marginBp).toBe(5265) // 1,000 ÷ 1,899 = 52.65%
  })

  it('shows a free item as a loss, with no margin', () => {
    const pillows = gm.rows.find((r) => r.lineId === ev.lines[1].lineId)!
    expect(pillows).toMatchObject({ sellingCents: 0, costCents: 6000, grossCents: -6000, marginBp: null })
  })

  it('shows delivery as a line: its price, and the store\'s delivery cost', () => {
    expect(gm.rows.find((r) => r.kind === 'delivery')).toMatchObject({ sellingCents: 14900, costCents: 4500, grossCents: 10400 })
  })

  it('shows financing as gross only', () => {
    expect(gm.rows.find((r) => r.kind === 'financing')).toMatchObject({ sellingCents: 0, grossCents: 5000, marginBp: null }) // $2,048 at 12 months: +$50
  })

  it('adds up to the ticket totals', () => {
    const sum = (f: (r: (typeof gm.rows)[number]) => number) => gm.rows.reduce((s, r) => s + f(r), 0)
    expect(sum((r) => r.sellingCents)).toBe(gm.totals.sellingCents)
    expect(sum((r) => r.costCents)).toBe(gm.totals.costCents)
    expect(sum((r) => r.grossCents)).toBe(gm.totals.grossCents)
    expect(gm.totals).toEqual({ sellingCents: ev.toplineCents, costCents: ev.productCostCents + ev.deliveryCostCents, grossCents: ev.grossCents, marginBp: ev.marginBp })
  })

  it('still shows the delivery cost when delivery is free', () => {
    const free = gmAnalysis(evaluate(deal([line('M1')], { delivery: { tierId: 'curbside', priceCents: 0 } }), ctx))
    expect(free.rows.find((r) => r.kind === 'delivery')).toMatchObject({ sellingCents: 0, costCents: 4500, grossCents: -4500, marginBp: null })
  })
})

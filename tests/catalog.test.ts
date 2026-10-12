import { describe, expect, it } from 'vitest'
import { evaluate, isLocked, makeCatalog, marginBp, validateSettings } from '../src/engine'
import { CATALOG } from '../src/data/catalog'
import { DEFAULT_SETTINGS } from '../src/data/settings'

describe('demo catalog', () => {
  it('has 40–80 products with unique SKUs', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(40)
    expect(CATALOG.length).toBeLessThanOrEqual(80)
    expect(new Set(CATALOG.map((p) => p.sku)).size).toBe(CATALOG.length)
  })

  it('sells everything above cost, in every condition', () => {
    for (const p of CATALOG) {
      expect(p.listCents).toBeGreaterThan(p.costCents)
      for (const v of [p.floor, p.clearance]) if (v) expect(v.listCents).toBeGreaterThan(v.costCents)
    }
  })

  it('prices floor and clearance models below new', () => {
    for (const p of CATALOG) {
      if (p.floor) expect(p.floor.listCents).toBeLessThan(p.listCents)
      if (p.clearance) expect(p.clearance.listCents).toBeLessThan(p.listCents)
    }
  })

  it('makes the price-locked premium line sit in the middle tier at list price', () => {
    const locked = CATALOG.filter((p) => p.brand === 'Kestrel' && p.category === 'mattress')
    expect(locked.length).toBeGreaterThan(0)
    for (const p of locked) {
      expect(isLocked(p, DEFAULT_SETTINGS)).toBe(true)
      const m = marginBp(p.listCents - p.costCents, p.listCents)
      expect(m).toBeGreaterThanOrEqual(4000)
      expect(m).toBeLessThan(5000)
    }
  })

  it('puts every other mattress in the top tier at list price', () => {
    const ctx = { catalog: makeCatalog(CATALOG), settings: DEFAULT_SETTINGS }
    for (const p of CATALOG.filter((p) => p.category === 'mattress' && p.brand !== 'Kestrel')) {
      const ev = evaluate({ lines: [{ id: 'a', sku: p.sku, condition: 'new', qty: 1, discountCents: 0 }], delivery: null, financingMonths: null, bundleDealIds: [] }, ctx)
      expect(ev.tier?.id, p.sku).toBe('top')
    }
  })
})

describe('default rules', () => {
  it('pass the settings check', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual([])
  })
})

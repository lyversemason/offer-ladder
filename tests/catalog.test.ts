import { describe, expect, it } from 'vitest'
import { evaluate, floorBp, isLocked, makeCatalog, marginBp, validateSettings } from '../src/engine'
import type { Deal } from '../src/engine'
import { CATALOG, SIZE_CODES } from '../src/data/catalog'
import { DEFAULT_SETTINGS } from '../src/data/settings'

const ctx = { catalog: makeCatalog(CATALOG), settings: DEFAULT_SETTINGS }
const bundle = (...skus: string[]): Deal => ({
  lines: skus.map((sku, i) => ({ id: `l${i}`, sku, condition: 'new', qty: 1, discountCents: 0 })),
  delivery: null,
  financingMonths: null,
  bundleDealIds: [],
})
const models = (filter: (p: (typeof CATALOG)[number]) => boolean) =>
  [...new Set(CATALOG.filter(filter).map((p) => p.model))].sort()

describe('demo catalog', () => {
  it('has the 2025 lineup: 42 models in 238 sizes, each with its own item code', () => {
    expect(new Set(CATALOG.map((p) => p.modelSku)).size).toBe(42)
    expect(CATALOG.length).toBe(238)
    expect(new Set(CATALOG.map((p) => p.sku)).size).toBe(CATALOG.length)
  })

  it('builds every item code from the model SKU and a size code', () => {
    for (const p of CATALOG) {
      expect(p.modelSku).toMatch(/^\d{6}$/)
      expect(p.sku).toBe(`${p.modelSku}-${SIZE_CODES[p.size!]}`)
    }
  })

  it('sells everything above cost, new and outlet', () => {
    for (const p of CATALOG) {
      expect(p.listCents, p.sku).toBeGreaterThan(p.costCents)
      if (p.outlet) {
        expect(p.outlet.listCents).toBe(p.listCents)
        expect(p.outlet.costCents, p.sku).toBeGreaterThan(0)
      }
    }
  })

  it('costs less as an outlet piece, except where the vendor sheet says otherwise', () => {
    // As on the vendor's sheet: Lavender Field's smaller sizes cost the same or a
    // little more as outlet pieces. Kept as they are, not "fixed" by guessing.
    const notCheaper = CATALOG.filter((p) => p.outlet && p.outlet.costCents >= p.costCents)
    expect(notCheaper.map((p) => `${p.model} ${p.size}`)).toEqual([
      'Lavender Field Extra Firm Twin',
      'Lavender Field Extra Firm Twin XL',
      'Lavender Field Extra Firm Full',
      'Lavender Field Extra Firm Queen',
    ])
  })

  it('never sells pillows, sheets or protectors as outlet pieces', () => {
    const soft = CATALOG.filter((p) => ['pillow', 'sheets', 'protector'].includes(p.category))
    expect(soft.length).toBeGreaterThan(0)
    for (const p of soft) expect(p.outlet, p.sku).toBeUndefined()
  })

  it('locks the Guardian and Bakersville mattresses and three Guardian bases, nothing else', () => {
    expect(models((p) => isLocked(p, DEFAULT_SETTINGS) && p.category === 'mattress')).toEqual(
      models((p) => p.category === 'mattress' && (p.brand === 'Guardian' || p.brand === 'Bakersville')),
    )
    expect(models((p) => isLocked(p, DEFAULT_SETTINGS) && p.category !== 'mattress')).toEqual([
      'Calm Orbit Base',
      'Grand Orbit Base',
      'Silent Orbit Base',
    ])
  })

  it('keeps every mattress at or above the margin floor at list price', () => {
    for (const p of CATALOG.filter((p) => p.category === 'mattress')) {
      expect(marginBp(p.listCents - p.costCents, p.listCents), p.sku).toBeGreaterThanOrEqual(floorBp(DEFAULT_SETTINGS))
    }
  })

  it('puts a Guardian mattress only on a Guardian foundation or base', () => {
    const queen = (model: string) => CATALOG.find((p) => p.model === model && p.size === 'Queen')!.sku
    const codes = (...skus: string[]) => evaluate(bundle(...skus), ctx).issues.map((i) => i.code)
    expect(codes(queen('Quiet Moon Medium'), queen('Gentle Drift Base'))).toContain('pairing')
    expect(codes(queen('Quiet Moon Medium'), queen('Snug Cottage Foundation'))).toContain('pairing')
    expect(codes(queen('Quiet Moon Medium'), queen('Calm Orbit Base'))).not.toContain('pairing')
    expect(codes(queen('Quiet Moon Medium'), queen('Deep Midnight Foundation'))).not.toContain('pairing')
    // Any mattress can go on a Guardian base.
    expect(codes(queen('Golden Prairie Firm Hybrid'), queen('Soft Eclipse Base'))).not.toContain('pairing')
  })
})

describe('default rules', () => {
  it('pass the settings check', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual([])
  })

  it('charge the store the same delivery cost on every tier, even free delivery', () => {
    const silver = evaluate({ ...bundle('366239-Q'), delivery: { tierId: 'silver', priceCents: 0 } }, ctx)
    expect(silver.deliveryCostCents).toBe(4560)
  })
})

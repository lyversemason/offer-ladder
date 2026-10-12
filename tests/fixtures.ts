// A tiny made-up catalog and rule set for the engine tests. Kept separate from the
// demo data on purpose: the demo catalog can change without breaking the math tests.
import { makeCatalog } from '../src/engine'
import type { Ctx, Deal, DealLine, Product, Settings } from '../src/engine'

export const products: Product[] = [
  // 55.0% margin new; as an outlet piece 59.97%
  { sku: 'M1', modelSku: 'M1', brand: 'Alder', model: 'Alder Plush', category: 'mattress', size: 'Queen', listCents: 199900, costCents: 89900, outlet: { listCents: 149900, costCents: 60000 } },
  // Price-locked premium line, 45.0% margin
  { sku: 'MK', modelSku: 'MK', brand: 'Kestrel', model: 'Kestrel Summit', category: 'mattress', size: 'Queen', listCents: 349900, costCents: 192445 },
  // 49.96% margin
  { sku: 'B1', modelSku: 'B1', brand: 'Alder', model: 'Glide Base', category: 'adjustable-base', size: 'Queen', listCents: 129900, costCents: 65000 },
  { sku: 'P1', modelSku: 'P1', brand: 'Alder', model: 'Cloud Pillow', category: 'pillow', listCents: 9900, costCents: 3000 },
  { sku: 'P2', modelSku: 'P2', brand: 'Alder', model: 'Cool Pillow', category: 'pillow', listCents: 14900, costCents: 5000 },
  { sku: 'PR1', modelSku: 'PR1', brand: 'Alder', model: 'Dry Protector', category: 'protector', size: 'Queen', listCents: 12900, costCents: 3000 },
  // A price-locked model outside the premium line
  { sku: 'PP', modelSku: 'PP', brand: 'Alder', model: 'Steel Frame', category: 'frame', listCents: 19900, costCents: 4000 },
]

export const settings: Settings = {
  tiers: [
    { id: 'top', label: 'Top', minMarginBp: 5000, rateBp: 1500 },
    { id: 'middle', label: 'Middle', minMarginBp: 4000, rateBp: 1100 },
    { id: 'low', label: 'Low', minMarginBp: 3400, rateBp: 700 },
  ],
  attach: { category: 'adjustable-base', bonusBp: 200 },
  minStep: { cents: 10000, pctBp: 500 },
  deliveryCostCents: 4500,
  deliveryTiers: [
    { id: 'curbside', label: 'Curbside', priceCents: 0, minPriceCents: 0 },
    { id: 'white-glove', label: 'White glove', priceCents: 14900, minPriceCents: 7900 },
  ],
  bundleDeals: [
    { id: 'pillow-2nd-half', kind: 'nth-off', label: 'Second pillow half off', category: 'pillow', nth: 2, pctOffBp: 5000 },
    { id: 'protector-with-mattress', kind: 'with-anchor', label: 'Protector 25% off with a mattress', category: 'protector', anchorCategory: 'mattress', pctOffBp: 2500 },
  ],
  financing: {
    terms: [12, 24, 36],
    bands: [
      { minCents: 0, adjustments: [0, null, null] },
      { minCents: 99900, adjustments: [2500, 0, null] },
      { minCents: 199900, adjustments: [5000, 0, -5000] },
      { minCents: 399900, adjustments: [7500, 2500, -2500] },
    ],
  },
  priceLock: { models: ['MK', 'PP'] },
  // Tested on its own (tests/evaluate.test.ts), so the other tests can mix brands.
  pairing: [],
  roundToCents: 1000,
}

export const ctx: Ctx = { catalog: makeCatalog(products), settings }

let n = 0
export function line(sku: string, extra: Partial<DealLine> = {}): DealLine {
  return { id: `l${++n}`, sku, condition: 'new', qty: 1, discountCents: 0, ...extra }
}

export function deal(lines: DealLine[], extra: Partial<Deal> = {}): Deal {
  return { lines, delivery: null, financingMonths: null, bundleDealIds: [], ...extra }
}

export const whiteGlove = { tierId: 'white-glove', priceCents: 14900 }

/** Small seeded random generator, so "random" tests are the same every run. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

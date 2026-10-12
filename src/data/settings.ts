// Lantern Lane Home's starting rules. All numbers are made up. The manager can
// change every one of them in the app.
import { dollars } from '../engine'
import type { Settings } from '../engine'

const $ = dollars

export const DEFAULT_SETTINGS: Settings = {
  tiers: [
    { id: 'top', label: 'Top', minMarginBp: 5000, rateBp: 1500 },
    { id: 'middle', label: 'Middle', minMarginBp: 4000, rateBp: 1100 },
    { id: 'low', label: 'Low', minMarginBp: 3400, rateBp: 700 },
  ],
  attach: { category: 'adjustable-base', bonusBp: 200 },
  minStep: { cents: $(100), pctBp: 500 },
  deliveryCostCents: $(45),
  deliveryTiers: [
    { id: 'curbside', label: 'Curbside', priceCents: 0, minPriceCents: 0 },
    { id: 'room', label: 'Room of choice', priceCents: $(99), minPriceCents: $(49) },
    { id: 'white-glove', label: 'White glove (setup + haul away)', priceCents: $(149), minPriceCents: $(79) },
    { id: 'white-glove-base', label: 'White glove + base setup', priceCents: $(199), minPriceCents: $(99) },
  ],
  bundleDeals: [
    { id: 'pillow-2nd-half', kind: 'nth-off', label: 'Second pillow half off', category: 'pillow', nth: 2, pctOffBp: 5000 },
    { id: 'protector-with-mattress', kind: 'with-anchor', label: 'Protector 25% off with a mattress', category: 'protector', anchorCategory: 'mattress', pctOffBp: 2500 },
    { id: 'foundation-with-mattress', kind: 'with-anchor', label: 'Foundation half off with a mattress', category: 'foundation', anchorCategory: 'mattress', pctOffBp: 5000 },
  ],
  financing: {
    terms: [6, 12, 24, 36, 48, 60],
    bands: [
      { minCents: 0, adjustments: [0, 0, null, null, null, null] },
      { minCents: $(799), adjustments: [$(40), $(20), 0, null, null, null] },
      { minCents: $(1499), adjustments: [$(80), $(60), 0, $(-40), null, null] },
      { minCents: $(2499), adjustments: [$(150), $(120), 0, 0, $(-80), null] },
      { minCents: $(3499), adjustments: [$(220), $(180), $(40), 0, $(-60), $(-110)] },
      { minCents: $(4999), adjustments: [$(275), $(250), $(120), $(40), $(-40), $(-90)] },
    ],
  },
  priceLock: { brands: ['Kestrel'], categories: ['protection-plan'] },
  roundToCents: $(10),
}

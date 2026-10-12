// Lantern Lane Home's starting rules, modeled on a real store's 2025 rules. Dollar
// amounts are disguised the same way as the catalog's, so the rules and the
// prices still fit together. The manager can change every one of them in the app.
import { dollars } from '../engine'
import type { Settings } from '../engine'
import { LOCKED_MODELS } from './catalog'

const $ = dollars

export const DEFAULT_SETTINGS: Settings = {
  tiers: [
    { id: 'top', label: 'Top', minMarginBp: 4750, rateBp: 1800 },
    { id: 'middle', label: 'Middle', minMarginBp: 4300, rateBp: 1400 },
    // Pays at any margin that makes money: 0.01% is the floor, so a sale can make
    // very little, but it can't break even or lose money.
    { id: 'low', label: 'Low', minMarginBp: 1, rateBp: 1000 },
  ],
  attach: { category: 'adjustable-base', bonusBp: 300 },
  minStep: { cents: $(120), pctBp: 500 },
  // The offer ladder stops suggesting lower prices at 20% margin.
  finalOfferMarginBp: 2000,
  // The same store cost on every delivery, even a free one. Pickup (no delivery)
  // costs nothing.
  deliveryCostCents: $(45.6),
  deliveryTiers: [
    { id: 'silver', label: 'Silver', priceCents: 0, minPriceCents: 0 },
    { id: 'gold', label: 'Gold', priceCents: $(119.99), minPriceCents: 0 },
    { id: 'platinum', label: 'Platinum', priceCents: $(179.99), minPriceCents: 0 },
    { id: 'diamond', label: 'Diamond', priceCents: $(239.99), minPriceCents: 0 },
  ],
  bundleDeals: [
    { id: 'pillow-2nd-half', kind: 'nth-off', label: 'Second pillow half off', category: 'pillow', nth: 2, pctOffBp: 5000 },
    { id: 'protector-with-mattress', kind: 'with-anchor', label: 'Protector 25% off with a mattress', category: 'protector', anchorCategory: 'mattress', pctOffBp: 2500 },
    { id: 'foundation-with-mattress', kind: 'with-anchor', label: 'Foundation half off with a mattress', category: 'foundation', anchorCategory: 'mattress', pctOffBp: 5000 },
  ],
  // Positive = added to the sale's gross dollars, negative = taken out,
  // null = that term isn't offered at that amount.
  financing: {
    terms: [6, 12, 24, 36, 48, 60, 72],
    bands: [
      { minCents: 0, adjustments: [0, 0, null, null, null, null, null] },
      { minCents: $(1199), adjustments: [$(60), $(30), 0, null, null, null, null] },
      { minCents: $(1799), adjustments: [$(120), $(90), 0, $(-60), null, null, null] },
      { minCents: $(2399), adjustments: [$(150), $(120), 0, $(-30), null, null, null] },
      { minCents: $(2999), adjustments: [$(240), $(210), 0, 0, $(-120), null, null] },
      { minCents: $(3599), adjustments: [$(300), $(270), $(30), 0, $(-90), $(-120), null] },
      { minCents: $(4199), adjustments: [$(330), $(300), $(60), 0, $(-60), $(-90), null] },
      { minCents: $(4799), adjustments: [$(360), $(330), $(90), $(30), 0, $(-60), $(-120)] },
      { minCents: $(5399), adjustments: [$(390), $(360), $(120), $(60), $(30), $(-30), $(-90)] },
      { minCents: $(5999), adjustments: [$(420), $(390), $(210), $(120), $(60), $(-30), $(-60)] },
      { minCents: $(6599), adjustments: [$(420), $(390), $(240), $(150), $(60), $(-30), $(-60)] },
      { minCents: $(7199), adjustments: [$(420), $(390), $(300), $(180), $(60), 0, $(-60)] },
    ],
  },
  priceLock: { models: LOCKED_MODELS },
  // A Guardian mattress only goes on a Guardian foundation or base (any mattress
  // can go on a Guardian one).
  pairing: [{ brand: 'Guardian', supportBrands: ['Guardian'] }],
  roundToCents: $(10),
}

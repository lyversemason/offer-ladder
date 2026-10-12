import { describe, expect, it } from 'vitest'
import { validateSettings } from '../src/engine'
import type { Settings } from '../src/engine'
import { settings } from './fixtures'

const edit = (change: (s: Settings) => void) => {
  const s: Settings = structuredClone(settings)
  change(s)
  return validateSettings(s)
}

describe('manager settings check', () => {
  it('accepts the test settings', () => {
    expect(validateSettings(settings)).toEqual([])
  })

  it('rejects tiers out of order', () => {
    expect(edit((s) => (s.tiers[1].minMarginBp = 5500)).join(' ')).toMatch(/Middle must start below Top/)
  })

  it('rejects a lower tier paying a higher rate', () => {
    expect(edit((s) => (s.tiers[2].rateBp = 2000)).join(' ')).toMatch(/Low pays more than Middle/)
  })

  it('needs at least two tiers', () => {
    expect(edit((s) => (s.tiers = s.tiers.slice(0, 1)))).toContain('There must be at least two commission tiers.')
  })

  it('rejects a margin of 100% or more', () => {
    expect(edit((s) => (s.tiers[0].minMarginBp = 10000)).length).toBeGreaterThan(0)
  })

  it('rejects a delivery minimum above its price', () => {
    expect(edit((s) => (s.deliveryTiers[1].minPriceCents = 20000)).join(' ')).toMatch(/White glove/)
  })

  it('rejects a bundle deal with a bad discount or nth', () => {
    expect(edit((s) => (s.bundleDeals[0].pctOffBp = 0)).length).toBe(1)
    expect(
      edit((s) => {
        const b = s.bundleDeals[0]
        if (b.kind === 'nth-off') b.nth = 1
      }).length,
    ).toBe(1)
  })

  it('rejects a financing row with the wrong number of terms, or out of order', () => {
    expect(edit((s) => s.financing.bands[1].adjustments.pop()).join(' ')).toMatch(/one value per term/)
    expect(edit((s) => (s.financing.bands[2].minCents = 50000)).join(' ')).toMatch(/go up in amount/)
  })

  it('rejects negative costs and steps', () => {
    expect(edit((s) => (s.deliveryCostCents = -1)).length).toBe(1)
    expect(edit((s) => (s.minStep.cents = -1)).length).toBe(1)
    expect(edit((s) => (s.attach.bonusBp = -1)).length).toBe(1)
  })
})

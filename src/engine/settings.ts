import { BP, formatMoney, formatPct } from './money'
import type { Settings } from './types'

/**
 * Checks a manager's rule changes before they're saved. Returns plain-language
 * problems; an empty list means the settings are safe to use.
 */
export function validateSettings(s: Settings): string[] {
  const problems: string[] = []
  const pct = (bp: number) => formatPct(bp, 2)

  if (s.tiers.length < 2) problems.push('There must be at least two commission tiers.')
  s.tiers.forEach((t, i) => {
    if (!t.label.trim()) problems.push(`Tier ${i + 1} needs a name.`)
    if (t.minMarginBp < 0 || t.minMarginBp >= BP)
      problems.push(`${t.label}: the minimum margin must be between 0% and 100%.`)
    if (t.rateBp < 0 || t.rateBp > BP) problems.push(`${t.label}: the rate must be between 0% and 100%.`)
    const above = s.tiers[i - 1]
    if (above && t.minMarginBp >= above.minMarginBp)
      problems.push(`${t.label} must start below ${above.label} (${pct(t.minMarginBp)} is not below ${pct(above.minMarginBp)}).`)
    if (above && t.rateBp > above.rateBp)
      problems.push(`${t.label} pays more than ${above.label}; a lower margin should never pay a higher rate.`)
  })
  if (new Set(s.tiers.map((t) => t.id)).size !== s.tiers.length) problems.push('Two tiers share the same id.')

  if (s.attach.bonusBp < 0) problems.push('The attach bonus cannot be negative.')
  if (s.minStep.cents < 0 || s.minStep.pctBp < 0) problems.push('The minimum step cannot be negative.')
  const floor = s.tiers[s.tiers.length - 1]
  if (floor && (s.finalOfferMarginBp < floor.minMarginBp || s.finalOfferMarginBp >= BP))
    problems.push(`The final offer's margin must be between the floor (${pct(floor.minMarginBp)}) and 100%.`)
  if (s.deliveryCostCents < 0) problems.push('The delivery cost cannot be negative.')
  for (const d of s.deliveryTiers) {
    if (d.minPriceCents > d.priceCents)
      problems.push(`${d.label}: the lowest price (${formatMoney(d.minPriceCents)}) is above the price (${formatMoney(d.priceCents)}).`)
    if (d.minPriceCents < 0) problems.push(`${d.label}: the lowest price cannot be negative.`)
  }
  for (const b of s.bundleDeals) {
    if (b.pctOffBp <= 0 || b.pctOffBp > BP) problems.push(`${b.label}: the discount must be between 0% and 100%.`)
    if (b.kind === 'nth-off' && (!Number.isInteger(b.nth) || b.nth < 2))
      problems.push(`${b.label}: "every nth item" must be 2 or more.`)
  }
  const bands = s.financing.bands
  bands.forEach((b, i) => {
    if (b.adjustments.length !== s.financing.terms.length)
      problems.push(`Financing row ${i + 1} needs one value per term.`)
    if (i > 0 && b.minCents <= bands[i - 1].minCents)
      problems.push(`Financing rows must go up in amount (row ${i + 1}).`)
  })
  if (s.roundToCents < 1) problems.push('Offers must round to at least one cent.')
  return problems
}

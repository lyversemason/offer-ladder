// The README's worked negotiation must match what the app really shows.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildLadder, formatMoney, makeCatalog } from '../src/engine'
import { CATALOG } from '../src/data/catalog'
import { DEFAULT_SETTINGS } from '../src/data/settings'

// The same deal as the app's "Load sample deal" button.
const SAMPLE = {
  lines: [
    { id: 'a', sku: '366239-Q', condition: 'new' as const, qty: 1, discountCents: 0 },
    { id: 'b', sku: '365028-Q', condition: 'new' as const, qty: 1, discountCents: 0 },
    { id: 'c', sku: '365983-Q', condition: 'new' as const, qty: 2, discountCents: 0 },
    { id: 'd', sku: '366272-Q', condition: 'new' as const, qty: 1, discountCents: 0 },
  ],
  delivery: { tierId: 'platinum', priceCents: 17999 },
  financingMonths: null,
  bundleDealIds: [],
}

describe('README worked example', () => {
  const readme = readFileSync(join(import.meta.dirname, '../README.md'), 'utf8')
  const ladder = buildLadder(SAMPLE, { catalog: makeCatalog(CATALOG), settings: DEFAULT_SETTINGS })
  const money = (c: number) => formatMoney(c, { always2: c % 100 !== 0 })

  it('lists every rung with the price and commission the engine gives', () => {
    for (const r of ladder.rungs) {
      const row = readme.split('\n').find((l) => l.startsWith(`| ${r.label}`))
      expect(row, r.label).toBeDefined()
      expect(row).toContain(money(r.ev.toplineCents))
      expect(row).toContain(money(r.ev.commissionCents))
      expect(row).toContain(r.ev.tier!.label)
    }
  })

  it('quotes what each step costs the rep for how much off', () => {
    for (const r of ladder.rungs.slice(1)) {
      expect(readme).toContain(`${money(-r.commissionChangeCents)} for ${money(r.stepCents)} off`)
    }
  })

  it('quotes the commission tiers the app uses', () => {
    const [top, middle, low] = DEFAULT_SETTINGS.tiers
    expect(readme).toContain(`top tier ${top.minMarginBp / 100}%+ margin pays ${top.rateBp / 100}%`)
    expect(readme).toContain(`middle ${middle.minMarginBp / 100}–`)
    expect(readme).toContain(`pays ${middle.rateBp / 100}%, low pays ${low.rateBp / 100}% down to a ${low.minMarginBp / 100}%`)
    expect(readme).toContain(`final-offer margin (${DEFAULT_SETTINGS.finalOfferMarginBp / 100}%)`)
    expect(readme).toContain(`plus ${DEFAULT_SETTINGS.attach.bonusBp / 100} points`)
  })

  it('matches the sample deal in the app', () => {
    const app = readFileSync(join(import.meta.dirname, '../src/ui/state.ts'), 'utf8')
    for (const l of SAMPLE.lines) expect(app).toContain(`sku: '${l.sku}', condition: 'new', qty: ${l.qty}`)
    expect(app).toContain("delivery: { tierId: 'platinum', priceCents: 17999 }")
  })
})

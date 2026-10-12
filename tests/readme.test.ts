// The README's worked negotiation must match what the app really shows.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { baseDeal, evaluate, formatMoney, lowestPriceAtMargin, lowestTotal, makeCatalog, priceBundleAt } from '../src/engine'
import type { Evaluation } from '../src/engine'
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
}

describe('README worked example', () => {
  const readme = readFileSync(join(import.meta.dirname, '../README.md'), 'utf8')
  const ctx = { catalog: makeCatalog(CATALOG), settings: DEFAULT_SETTINGS }
  const money = (c: number) => formatMoney(c, { always2: c % 100 !== 0 })
  const [top, middle] = DEFAULT_SETTINGS.tiers
  const at = (bp: number) => lowestPriceAtMargin(baseDeal(SAMPLE, ctx), bp, 'spread', ctx)!.ev
  const lowest = lowestTotal(SAMPLE, ctx)!
  const rows: [string, Evaluation][] = [
    ['Full price', evaluate(SAMPLE, ctx)],
    ['Lowest in the top tier', at(top.minMarginBp)],
    ['Lowest in the middle tier', at(middle.minMarginBp)],
    [`The exceptions margin (${DEFAULT_SETTINGS.exceptionMarginBp / 100}%)`, at(DEFAULT_SETTINGS.exceptionMarginBp)],
    ['Lowest the store allows', priceBundleAt(SAMPLE, lowest, 'spread', ctx).ev],
  ]

  it('lists where each price lands, with the numbers the engine gives', () => {
    for (const [label, ev] of rows) {
      const row = readme.split('\n').find((l) => l.startsWith(`| ${label} |`))
      expect(row, label).toBeDefined()
      expect(row).toContain(money(ev.toplineCents))
      expect(row).toContain(money(ev.totalWithTaxCents))
      expect(row).toContain(money(ev.commissionCents))
      expect(row).toContain(ev.tier!.label)
    }
  })

  it('quotes the commission tiers the app uses', () => {
    const [top, middle, low] = DEFAULT_SETTINGS.tiers
    expect(readme).toContain(`top tier ${top.minMarginBp / 100}%+ margin pays ${top.rateBp / 100}%`)
    expect(readme).toContain(`middle ${middle.minMarginBp / 100}–`)
    expect(readme).toContain(`pays ${middle.rateBp / 100}%, low pays ${low.rateBp / 100}% down to a ${low.minMarginBp / 100}%`)
    expect(readme).toContain(`exceptions margin (${DEFAULT_SETTINGS.exceptionMarginBp / 100}%)`)
    expect(readme).toContain(`plus ${DEFAULT_SETTINGS.attach.bonusBp / 100} points`)
  })

  it('matches the sample deal in the app', () => {
    const app = readFileSync(join(import.meta.dirname, '../src/ui/state.ts'), 'utf8')
    for (const l of SAMPLE.lines) expect(app).toContain(`sku: '${l.sku}', condition: 'new', qty: ${l.qty}`)
    expect(app).toContain("delivery: { tierId: 'platinum', priceCents: 17999 }")
  })
})

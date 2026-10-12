// Formatting helpers shared by the screens (display only; no money math).
import { formatMoney, formatPct } from '../engine'
import type { Evaluation } from '../engine'

export const money = (c: number) => formatMoney(c, { always2: c % 100 !== 0 })
export const pct = (bp: number) => formatPct(bp, 1)

/** Maps any tier id to one of the three tier colors. */
export function tierClass(id: string) {
  return ['top', 'middle', 'low'].includes(id) ? id : 'middle'
}

export function tierColorClass(ev: Evaluation) {
  if (ev.toplineCents <= 0) return 'none'
  return ev.tier ? tierClass(ev.tier.id) : 'below'
}

/** Parses "$1,234.50", "1234.5" or "1234" into cents; null when it isn't a number. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, '')
  if (!/^-?\d*(\.\d{0,2})?$/.test(clean) || clean === '' || clean === '.') return null
  return Math.round(Number(clean) * 100)
}

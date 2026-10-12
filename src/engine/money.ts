// Money is always whole cents (integers) and percents are basis points
// (1 bp = 0.01%, so 50% = 5000 bp). Integers never pick up the tiny rounding
// errors decimals do, so the same deal always gives the same commission.

export type Cents = number
export type Bp = number

export const BP = 10_000

/** Rounds half away from zero, so -0.5 cents and 0.5 cents behave the same way. */
export function roundHalf(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n)
}

/** cents × percent, rounded to the nearest cent. */
export function applyBp(cents: Cents, bp: Bp): Cents {
  return roundHalf((cents * bp) / BP)
}

/**
 * True when gross ÷ topline is at least the given margin. Compared with
 * multiplication instead of division so 49.999% can never round up into 50%.
 */
export function meetsMargin(grossCents: Cents, toplineCents: Cents, marginBp: Bp): boolean {
  if (toplineCents <= 0) return false
  return grossCents * BP >= marginBp * toplineCents
}

/** Margin in basis points, rounded down (for display and storage). */
export function marginBp(grossCents: Cents, toplineCents: Cents): Bp {
  if (toplineCents <= 0) return 0
  return Math.floor((grossCents * BP) / toplineCents)
}

/** Rounds up to the next multiple of step (e.g. the next whole $10). */
export function roundUpTo(cents: Cents, step: Cents): Cents {
  return Math.ceil(cents / step) * step
}

export function dollars(n: number): Cents {
  return Math.round(n * 100)
}

/** "$1,234.50", or "$1,234" when whole. */
export function formatMoney(cents: Cents, opts: { always2?: boolean } = {}): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const rest = abs % 100
  const wholeStr = whole.toLocaleString('en-US')
  if (rest === 0 && !opts.always2) return `${sign}$${wholeStr}`
  return `${sign}$${wholeStr}.${String(rest).padStart(2, '0')}`
}

/** "48.7%" */
export function formatPct(bp: Bp, digits = 1): string {
  return `${(bp / 100).toFixed(digits)}%`
}

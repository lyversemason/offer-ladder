// A small "seeded" random number generator: the same seed always gives the same
// sequence, so the demo history is identical on every load and in every test.
export type Rand = () => number

export function seeded(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A whole number from min to max, both included. */
export function between(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1))
}

export function pick<T>(rand: Rand, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]
}

/** Picks a key with probability proportional to its weight. */
export function weighted<K extends string>(rand: Rand, weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [key, w] of entries) {
    r -= w
    if (r < 0) return key
  }
  return entries[entries.length - 1][0]
}

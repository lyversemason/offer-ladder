// Which bed a size fits. Some items come in combined sizes ("King / Cal King"
// sheets) or in pieces ("Split King" = two Twin XL halves), so matching an
// add-on to a bed compares the beds each size fits, not the size names.

const FITS: Record<string, string[]> = {
  'Twin / Twin XL': ['Twin', 'Twin XL'],
  'King / Cal King': ['King', 'Cal King'],
  'Standard / Queen': ['Queen'],
  'King 1-piece': ['King'],
  'Cal King 1-piece': ['Cal King'],
  'Split King': ['King'],
  'Split Cal King': ['Cal King'],
  'Split Cal King half': ['Cal King'],
  'Split-head King': ['King'],
  'Dual King': ['King'],
  'Split Queen': ['Queen'],
  'Split Full': ['Full'],
}

/** The bed sizes a product size fits. */
export function bedSizes(size: string): string[] {
  return FITS[size] ?? [size]
}

/** True when the two sizes fit at least one bed in common. */
export function sizesFit(a: string, b: string): boolean {
  const beds = bedSizes(b)
  return bedSizes(a).some((s) => beds.includes(s))
}

// The demo catalog for Lantern Lane Home, a made-up store. Every brand, product,
// price and cost here is invented. Kestrel is the premium line the maker won't let
// stores discount (price-locked), which is why it needs the rest of the bundle.
import { dollars } from '../engine'
import type { Category, PriceCost, Product } from '../engine'

type Row = [sku: string, model: string, size: string | undefined, list: number, cost: number]

interface Line {
  brand: string
  category: Category
  /** Floor models: share of list price and of cost. */
  floor?: [listShare: number, costShare: number]
  clearance?: [listShare: number, costShare: number]
  rows: Row[]
}

const LINES: Line[] = [
  {
    brand: 'Kestrel',
    category: 'mattress',
    rows: [
      ['KES-SUM-Q', 'Summit Medium', 'Queen', 3499, 1924.45],
      ['KES-SUM-K', 'Summit Medium', 'King', 3999, 2199.45],
      ['KES-ARI-Q', 'Aria Plush', 'Queen', 4299, 2407.44],
      ['KES-ARI-K', 'Aria Plush', 'King', 4799, 2687.44],
    ],
  },
  {
    brand: 'Larkspur',
    category: 'mattress',
    floor: [0.8, 0.62],
    rows: [
      ['LRK-HF-T', 'Hybrid Firm', 'Twin', 1299, 584],
      ['LRK-HF-F', 'Hybrid Firm', 'Full', 1699, 765],
      ['LRK-HF-Q', 'Hybrid Firm', 'Queen', 1999, 899],
      ['LRK-HF-K', 'Hybrid Firm', 'King', 2299, 1035],
      ['LRK-HP-Q', 'Hybrid Plush', 'Queen', 2199, 989],
      ['LRK-HP-K', 'Hybrid Plush', 'King', 2499, 1124],
    ],
  },
  {
    brand: 'Tidewell',
    category: 'mattress',
    floor: [0.8, 0.6],
    clearance: [0.7, 0.55],
    rows: [
      ['TDW-CH-Q', 'Cool Hybrid', 'Queen', 2699, 1295],
      ['TDW-CH-K', 'Cool Hybrid', 'King', 2999, 1440],
    ],
  },
  {
    brand: 'Bramble',
    category: 'mattress',
    clearance: [0.75, 0.6],
    rows: [
      ['BRM-CL-T', 'Classic Innerspring', 'Twin', 599, 240],
      ['BRM-CL-F', 'Classic Innerspring', 'Full', 799, 320],
      ['BRM-CL-Q', 'Classic Innerspring', 'Queen', 899, 360],
      ['BRM-CL-K', 'Classic Innerspring', 'King', 1099, 440],
      ['BRM-MF-Q', 'Memory Foam', 'Queen', 1199, 480],
      ['BRM-MF-K', 'Memory Foam', 'King', 1399, 560],
    ],
  },
  {
    brand: 'Lantern Lane',
    category: 'mattress',
    rows: [
      ['LLH-ES-T', 'Essential Foam', 'Twin', 399, 144],
      ['LLH-ES-F', 'Essential Foam', 'Full', 499, 180],
      ['LLH-ES-Q', 'Essential Foam', 'Queen', 599, 215],
    ],
  },
  {
    brand: 'Lantern Lane',
    category: 'foundation',
    rows: [
      ['LLH-FD-T', 'Standard Foundation', 'Twin', 199, 80],
      ['LLH-FD-F', 'Standard Foundation', 'Full', 229, 92],
      ['LLH-FD-Q', 'Standard Foundation', 'Queen', 249, 100],
      ['LLH-FD-K', 'Standard Foundation', 'King', 299, 120],
      ['LLH-LP-Q', 'Low-Profile Foundation', 'Queen', 279, 112],
      ['LLH-LP-K', 'Low-Profile Foundation', 'King', 329, 132],
    ],
  },
  {
    brand: 'Glide',
    category: 'adjustable-base',
    floor: [0.75, 0.6],
    rows: [
      ['GLD-BS-Q', 'Glide Base', 'Queen', 899, 450],
      ['GLD-BS-K', 'Glide Base', 'King', 1099, 550],
      ['GLD-BS-SK', 'Glide Base', 'Split King', 1799, 900],
      ['GLD-PR-Q', 'Glide Pro (massage, under-bed light)', 'Queen', 1499, 720],
      ['GLD-PR-K', 'Glide Pro (massage, under-bed light)', 'King', 1799, 864],
      ['GLD-PR-SK', 'Glide Pro (massage, under-bed light)', 'Split King', 2999, 1440],
    ],
  },
  {
    brand: 'Kestrel',
    category: 'adjustable-base',
    rows: [
      ['KES-MB-Q', 'Motion Base', 'Queen', 2199, 1210],
      ['KES-MB-K', 'Motion Base', 'King', 2499, 1375],
    ],
  },
  {
    brand: 'Lantern Lane',
    category: 'pillow',
    rows: [
      ['LLH-CL-Q', 'Cloud Down-Alternative Pillow', 'Queen', 89, 25],
      ['LLH-CL-K', 'Cloud Down-Alternative Pillow', 'King', 99, 28],
      ['LLH-BP-Q', 'Basic Pillow', 'Queen', 49, 8],
    ],
  },
  {
    brand: 'Tidewell',
    category: 'pillow',
    rows: [
      ['TDW-CP-Q', 'Cool Contour Pillow', 'Queen', 149, 49],
      ['TDW-CP-K', 'Cool Contour Pillow', 'King', 169, 56],
    ],
  },
  {
    brand: 'Kestrel',
    category: 'pillow',
    rows: [['KES-CP-Q', 'Contour Pillow', 'Queen', 179, 98]],
  },
  {
    brand: 'Lantern Lane',
    category: 'protector',
    rows: [
      ['LLH-DG-T', 'Dry Guard Protector', 'Twin', 99, 22],
      ['LLH-DG-F', 'Dry Guard Protector', 'Full', 109, 24],
      ['LLH-DG-Q', 'Dry Guard Protector', 'Queen', 129, 28],
      ['LLH-DG-K', 'Dry Guard Protector', 'King', 149, 33],
    ],
  },
  {
    brand: 'Tidewell',
    category: 'protector',
    rows: [
      ['TDW-CG-Q', 'Cool Guard Protector', 'Queen', 169, 42],
      ['TDW-CG-K', 'Cool Guard Protector', 'King', 189, 47],
    ],
  },
  {
    brand: 'Lantern Lane',
    category: 'sheets',
    rows: [
      ['LLH-PS-Q', 'Percale Sheet Set', 'Queen', 129, 45],
      ['LLH-PS-K', 'Percale Sheet Set', 'King', 149, 52],
      ['LLH-BZ-Q', 'Breeze Sheet Set', 'Queen', 199, 76],
      ['LLH-BZ-K', 'Breeze Sheet Set', 'King', 229, 87],
    ],
  },
  {
    brand: 'Lantern Lane',
    category: 'protection-plan',
    rows: [
      ['LLH-PP-M5', '5-Year Mattress Protection Plan', undefined, 149, 30],
      ['LLH-PP-M10', '10-Year Mattress Protection Plan', undefined, 249, 50],
      ['LLH-PP-B5', '5-Year Base Protection Plan', undefined, 199, 45],
    ],
  },
]

/** Price and cost for a floor or clearance model, rounded to a retail price ending in 9. */
function variant(listCents: number, costCents: number, [listShare, costShare]: [number, number]): PriceCost {
  const list = Math.round((listCents * listShare) / 1000) * 1000 - 100
  return { listCents: list, costCents: Math.round(costCents * costShare) }
}

export const CATALOG: Product[] = LINES.flatMap((line) =>
  line.rows.map(([sku, model, size, list, cost]) => {
    const listCents = dollars(list)
    const costCents = dollars(cost)
    const product: Product = { sku, brand: line.brand, model, category: line.category, listCents, costCents }
    if (size) product.size = size
    if (line.floor) product.floor = variant(listCents, costCents, line.floor)
    if (line.clearance) product.clearance = variant(listCents, costCents, line.clearance)
    return product
  }),
)

export const CATEGORY_LABELS: Record<Category, string> = {
  mattress: 'Mattresses',
  foundation: 'Foundations',
  'adjustable-base': 'Adjustable bases',
  pillow: 'Pillows',
  protector: 'Protectors',
  sheets: 'Sheets',
  'protection-plan': 'Protection plans',
}

export function productName(p: Product): string {
  return [p.brand === 'Lantern Lane' ? '' : p.brand, p.model, p.size ? `(${p.size})` : '']
    .filter(Boolean)
    .join(' ')
}

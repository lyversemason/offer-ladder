// The catalog for Lantern Lane Home, a made-up store, modeled on a real 2025
// showroom lineup: its sizes, which lines are price-locked, and how price relates
// to cost. Every brand, model name, SKU and dollar amount is disguised.
//
// Guardian is the premium line the maker won't let stores discount (price-locked),
// which is why its bundles need margin from somewhere else.
import { applyBp, dollars } from '../engine'
import type { Category, Product } from '../engine'

/** [size, price, cost, outlet cost]: no outlet cost = not sold as an outlet piece. */
type Size = [size: string, price: number, cost: number, outletCost?: number]

interface Line {
  brand: string
  model: string
  category: Category
  /** Shared by every size of the model. */
  sku: string
  /** The maker sets the price: no discounts. */
  locked?: boolean
  sizes: Size[]
}

/** An outlet piece's price as a share of the new price: 80% = 20% off. */
export const OUTLET_PRICE_BP = 8000

/** Short codes for the item number: SKU + size code, e.g. 365927-Q. */
export const SIZE_CODES: Record<string, string> = {
  Twin: 'T',
  'Twin XL': 'TX',
  'Twin / Twin XL': 'TT',
  Full: 'F',
  'Split Full': 'SF',
  Queen: 'Q',
  'Standard / Queen': 'Q',
  'Split Queen': 'SQ',
  King: 'K',
  'King 1-piece': 'K1',
  'Split King': 'SK',
  'Split-head King': 'HK',
  'Dual King': 'DK',
  'King / Cal King': 'KC',
  'Cal King': 'CK',
  'Cal King 1-piece': 'C1',
  'Split Cal King': 'SC',
  'Split Cal King half': 'DC',
}

const LINES: Line[] = [
  {
    brand: 'Guardian',
    model: 'Quiet Moon Medium',
    category: 'mattress',
    sku: '366263',
    locked: true,
    sizes: [
      ['Twin', 2038.8, 1076.48, 807.36],
      ['Twin XL', 2038.8, 1076.48, 807.36],
      ['Full', 2458.8, 1298.24, 973.68],
      ['Queen', 2638.8, 1393.28, 1044.96],
      ['King', 3478.8, 1836.8, 1377.6],
      ['Cal King', 3478.8, 1836.8, 1377.6],
      ['Split Cal King half', 2038.8, 1076.48, 807.36],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Silver Dusk Firm',
    category: 'mattress',
    sku: '366264',
    locked: true,
    sizes: [
      ['Twin XL', 5038.8, 2256.61, 1692.46],
      ['Queen', 5638.8, 2553.61, 1915.2],
      ['King', 6478.8, 2969.41, 2227.06],
      ['Cal King', 6478.8, 2969.41, 2227.06],
      ['Split Cal King half', 5038.8, 2256.61, 1692.46],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Velvet Night Soft',
    category: 'mattress',
    sku: '366260',
    locked: true,
    sizes: [
      ['Twin', 3478.8, 1756.8, 1317.6],
      ['Twin XL', 3478.8, 1756.8, 1317.6],
      ['Full', 3898.8, 1968.9, 1476.67],
      ['Queen', 4078.8, 2059.8, 1544.84],
      ['King', 4918.8, 2484, 1863],
      ['Cal King', 4918.8, 2484, 1863],
      ['Split Cal King half', 3478.8, 1756.8, 1317.6],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Still Starlight Medium Hybrid',
    category: 'mattress',
    sku: '365903',
    locked: true,
    sizes: [
      ['Twin XL', 6238.8, 3059.4, 2294.56],
      ['Queen', 6838.8, 3359.4, 2519.56],
      ['King', 7678.8, 3779.4, 2834.56],
      ['Split-head King', 12117.6, 6118.8, 4589.1],
      ['Cal King', 7678.8, 3779.4, 2834.56],
      ['Split Cal King half', 6238.8, 3059.4, 2294.56],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Calm Orbit Base',
    category: 'adjustable-base',
    sku: '365900',
    locked: true,
    sizes: [
      ['Twin XL', 1798.8, 719.4, 539.56],
      ['Full', 1918.8, 779.4, 584.56],
      ['Queen', 1918.8, 779.4, 584.56],
      ['King 1-piece', 2758.8, 1199.4, 899.56],
      ['Cal King 1-piece', 2758.8, 1199.4, 899.56],
      ['Split Cal King half', 1798.8, 719.4, 539.56],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Silent Orbit Base',
    category: 'adjustable-base',
    sku: '365909',
    locked: true,
    sizes: [
      ['Twin XL', 2278.8, 959.4, 719.56],
      ['Full', 2398.8, 1019.4, 764.56],
      ['Queen', 2398.8, 1019.4, 764.56],
      ['King 1-piece', 3238.8, 1439.4, 1079.56],
      ['Cal King 1-piece', 3238.8, 1439.4, 1079.56],
      ['Split Cal King half', 2278.8, 959.4, 719.56],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Grand Orbit Base',
    category: 'adjustable-base',
    sku: '365908',
    locked: true,
    sizes: [
      ['Twin XL', 2638.8, 1234.21, 925.66],
      ['Queen', 2758.8, 1293.01, 969.76],
      ['King 1-piece', 3598.8, 1704.61, 1278.46],
      ['Cal King 1-piece', 3598.8, 1704.61, 1278.46],
      ['Split Cal King half', 2638.8, 1234.21, 925.66],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Soft Eclipse Base',
    category: 'adjustable-base',
    sku: '364740',
    sizes: [
      ['Twin', 1138.8, 398.22, 298.67],
      ['Twin XL', 1138.8, 398.22, 298.67],
      ['Full', 1258.8, 464.7, 348.53],
      ['Queen', 1258.8, 464.7, 348.53],
      ['King 1-piece', 1918.8, 797.1, 597.83],
      ['Cal King 1-piece', 1918.8, 797.1, 597.83],
      ['Split Cal King half', 1138.8, 398.22, 298.67],
    ],
  },
  {
    brand: 'Bakersville',
    model: 'Willow Hollow Firm PT',
    category: 'mattress',
    sku: '365206',
    locked: true,
    sizes: [
      ['Twin XL', 2758.8, 1583.36, 868.8],
      ['Full', 2818.8, 1615.04, 868.8],
      ['Queen', 2878.8, 1646.72, 868.8],
      ['King', 3598.8, 2026.88, 958.8],
      ['Cal King', 3598.8, 2026.88, 958.8],
      ['Split Cal King half', 2758.8, 1583.36, 868.8],
    ],
  },
  {
    brand: 'Bakersville',
    model: 'Ivy Garden Medium PT',
    category: 'mattress',
    sku: '366218',
    locked: true,
    sizes: [
      ['Twin XL', 4198.8, 2428.3, 958.8],
      ['Queen', 4318.8, 2490.58, 958.8],
      ['King', 5038.8, 2864.26, 1018.8],
      ['Cal King', 5038.8, 2864.26, 1018.8],
      ['Split Cal King half', 4198.8, 2428.3, 958.8],
    ],
  },
  {
    brand: 'Bakersville',
    model: 'Rose Arbor Plush PT',
    category: 'mattress',
    sku: '365294',
    locked: true,
    sizes: [
      ['Twin XL', 5518.8, 3237.94, 1018.8],
      ['Queen', 5638.8, 3300.22, 1018.8],
      ['King', 6358.8, 3673.9, 1018.8],
      ['Cal King', 6358.8, 3673.9, 1018.8],
      ['Split Cal King half', 5518.8, 3237.94, 1018.8],
    ],
  },
  {
    brand: 'Century',
    model: 'Amber Hearth Medium PT',
    category: 'mattress',
    sku: '366203',
    sizes: [
      ['Twin XL', 4738.8, 2734.66, 1018.8],
      ['Full', 5074.8, 2910.72, 1018.8],
      ['Queen', 5518.8, 3143.38, 1018.8],
      ['King', 6598.8, 3709.3, 1018.8],
      ['Cal King', 6598.8, 3709.3, 1018.8],
      ['Split Cal King half', 4738.8, 2734.66, 1018.8],
    ],
  },
  {
    brand: 'Century',
    model: 'Warm Ember Firm',
    category: 'mattress',
    sku: '366298',
    sizes: [
      ['Twin XL', 2938.8, 1917.22, 958.8],
      ['Full', 3274.8, 2093.28, 958.8],
      ['Queen', 3598.8, 2263.06, 958.8],
      ['King', 4438.8, 2703.22, 1018.8],
      ['Cal King', 4438.8, 2703.22, 1018.8],
      ['Split Cal King half', 2938.8, 1917.22, 958.8],
    ],
  },
  {
    brand: 'Century',
    model: 'Soft Candlelight Plush PT',
    category: 'mattress',
    sku: '366291',
    sizes: [
      ['Twin XL', 4138.8, 2168.74, 958.8],
      ['Full', 4474.8, 2344.8, 958.8],
      ['Queen', 4798.8, 2514.58, 958.8],
      ['King', 5638.8, 2954.74, 1018.8],
      ['Cal King', 5638.8, 2954.74, 1018.8],
      ['Split Cal King half', 4138.8, 2168.74, 958.8],
    ],
  },
  {
    brand: 'Optima',
    model: 'Gentle Tide Firm',
    category: 'mattress',
    sku: '365974',
    sizes: [
      ['Twin', 1379.99, 380.15, 304.13],
      ['Twin XL', 1619.99, 443.51, 354.82],
      ['Full', 1799.99, 506.87, 405.5],
      ['Queen', 1859.99, 506.87, 405.5],
      ['King', 2639.99, 760.31, 608.26],
      ['Cal King', 2639.99, 760.31, 608.26],
    ],
  },
  {
    brand: 'Optima',
    model: 'Quiet Cove Extra Firm',
    category: 'mattress',
    sku: '365977',
    sizes: [
      ['Twin', 1439.99, 760.31, 684.29],
      ['Twin XL', 1559.99, 823.67, 785.66],
      ['Full', 1619.99, 855.35, 811.01],
      ['Queen', 1679.99, 887.03, 811.01],
      ['King', 2279.99, 1203.83, 868.8],
      ['Cal King', 2279.99, 1203.83, 868.8],
      ['Split Cal King half', 1559.99, 823.67, 785.66],
    ],
  },
  {
    brand: 'Optima',
    model: 'Still Harbor Firm PT',
    category: 'mattress',
    sku: '365979',
    sizes: [
      ['Twin', 1799.99, 950.39, 868.8],
      ['Twin XL', 1919.99, 1013.75, 868.8],
      ['Full', 1979.99, 1045.43, 868.8],
      ['Queen', 2039.99, 1077.11, 868.8],
      ['King', 2639.99, 1393.91, 868.8],
      ['Cal King', 2639.99, 1393.91, 868.8],
    ],
  },
  {
    brand: 'Georgia',
    model: 'Clover Meadow Medium Hybrid',
    category: 'mattress',
    sku: '366238',
    sizes: [
      ['Twin', 1859.99, 887.03, 665.28],
      ['Twin XL', 1919.99, 1013.75, 760.32],
      ['Full', 1919.99, 1077.11, 807.84],
      ['Queen', 1919.99, 1077.11, 807.84],
      ['King', 2519.99, 1330.55, 868.8],
      ['Cal King', 2519.99, 1330.55, 868.8],
    ],
  },
  {
    brand: 'Georgia',
    model: 'Golden Prairie Firm Hybrid',
    category: 'mattress',
    sku: '366239',
    sizes: [
      ['Twin XL', 2219.99, 1077.11, 807.84],
      ['Full', 2279.99, 1235.51, 868.8],
      ['Queen', 2279.99, 1267.19, 868.8],
      ['King', 2879.99, 1583.99, 868.8],
      ['Cal King', 2879.99, 1583.99, 868.8],
    ],
  },
  {
    brand: 'Georgia',
    model: 'Morning Dew Medium Hybrid',
    category: 'mattress',
    sku: '366230',
    sizes: [
      ['Twin XL', 2819.99, 1330.55, 868.8],
      ['Full', 2879.99, 1552.31, 868.8],
      ['Queen', 2879.99, 1583.99, 868.8],
      ['King', 3479.99, 1837.43, 868.8],
      ['Cal King', 3479.99, 1837.43, 868.8],
    ],
  },
  {
    brand: 'Meridian',
    model: 'Warm Quilt Memory Foam',
    category: 'mattress',
    sku: '366254',
    sizes: [
      ['Twin', 1019.99, 506.87, 456.18],
      ['Twin XL', 1079.99, 570.23, 513.2],
      ['Full', 1139.99, 633.59, 570.23],
      ['Queen', 1199.99, 696.95, 627.25],
      ['King', 1379.99, 887.03, 798.32],
      ['Cal King', 1379.99, 887.03, 798.32],
    ],
  },
  {
    brand: 'Meridian',
    model: 'Snug Cabin Firm',
    category: 'mattress',
    sku: '366375',
    sizes: [
      ['Twin', 359.99, 190.07, 171.07],
      ['Twin XL', 395.99, 215.41, 193.87],
      ['Full', 431.99, 253.43, 228.1],
      ['Queen', 455.99, 278.77, 250.9],
      ['King', 575.99, 342.13, 307.92],
      ['Cal King', 575.99, 342.13, 307.92],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Deep Midnight Foundation',
    category: 'foundation',
    sku: '356295',
    sizes: [
      ['Twin XL', 306, 160.34, 62.4],
      ['Full', 456, 238.94, 62.4],
      ['Queen', 456, 238.94, 62.4],
      ['Split Queen', 306, 160.34, 62.4],
      ['Split Cal King half', 306, 160.34, 62.4],
    ],
  },
  {
    brand: 'Meridian',
    model: 'Snug Cottage Foundation',
    category: 'foundation',
    sku: '348005',
    sizes: [
      ['Twin', 203.99, 94.31, 45.6],
      ['Twin XL', 203.99, 94.31, 45.6],
      ['Full', 263.99, 125.75, 45.6],
      ['Split Full', 203.99, 94.31, 45.6],
      ['Queen', 263.99, 125.75, 45.6],
      ['Split Queen', 203.99, 94.31, 45.6],
      ['Split Cal King half', 203.99, 94.31, 45.6],
    ],
  },
  {
    brand: 'Century',
    model: 'Deep Hearth Foundation',
    category: 'foundation',
    sku: '366204',
    sizes: [
      ['Twin XL', 300, 157.2, 62.4],
      ['Full', 360, 188.64, 62.4],
      ['Queen', 360, 188.64, 62.4],
      ['Split Queen', 300, 157.2, 62.4],
      ['Split Cal King half', 300, 157.2, 62.4],
    ],
  },
  {
    brand: 'Futura',
    model: 'Cedar Hush',
    category: 'mattress',
    sku: '365270',
    sizes: [
      ['Twin XL', 1918.8, 1013.12, 759.84],
      ['Full', 2158.8, 1139.84, 854.88],
      ['Queen', 2278.8, 1203.2, 902.4],
      ['King', 2878.8, 1520, 1140],
      ['Cal King', 2878.8, 1520, 1140],
    ],
  },
  {
    brand: 'Futura',
    model: 'Misty Pine Hybrid',
    category: 'mattress',
    sku: '365170',
    sizes: [
      ['Twin XL', 3358.8, 1663.18, 1247.39],
      ['Full', 3778.8, 1851.82, 1388.87],
      ['Queen', 3958.8, 1946.14, 1459.61],
      ['King', 4798.8, 2323.42, 1742.57],
      ['Cal King', 4798.8, 2323.42, 1742.57],
    ],
  },
  {
    brand: 'Futura',
    model: 'Mossy Canyon Hybrid',
    category: 'mattress',
    sku: '365171',
    sizes: [
      ['Twin XL', 3894, 2040.46, 1530.35],
      ['Queen', 4434, 2323.42, 1742.57],
      ['King', 5274, 2700.7, 2025.53],
      ['Cal King', 5274, 2700.7, 2025.53],
    ],
  },
  {
    brand: 'Futura',
    model: 'Fern Valley Pillow',
    category: 'pillow',
    sku: '365922',
    sizes: [
      ['Standard / Queen', 238.8, 125.14],
      ['King', 286.8, 150.29],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Hushed Nebula Pillow',
    category: 'pillow',
    sku: '366320',
    sizes: [
      ['Queen', 270, 141.48],
      ['King', 330, 172.92],
    ],
  },
  {
    brand: 'Meridian',
    model: 'Cozy Nook Pillow',
    category: 'pillow',
    sku: '365983',
    sizes: [
      ['Queen', 179.99, 62.88],
      ['King', 239.99, 83.63],
    ],
  },
  {
    brand: 'Meridian',
    model: 'Soft Linen Sheet Set',
    category: 'sheets',
    sku: '366217',
    sizes: [
      ['Twin / Twin XL', 155.99, 54.71],
      ['Full', 179.99, 62.88],
      ['Queen', 179.99, 62.88],
      ['King / Cal King', 203.99, 71.05],
    ],
  },
  {
    brand: 'Futura',
    model: 'Birch Grove Sheet Set',
    category: 'sheets',
    sku: '359149',
    sizes: [
      ['Twin / Twin XL', 202.8, 106.27],
      ['Full', 250.8, 131.42],
      ['Queen', 274.8, 144],
      ['Split King', 334.8, 175.44],
      ['King / Cal King', 310.8, 162.86],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Pale Aurora Sheet Set',
    category: 'sheets',
    sku: '365928',
    sizes: [
      ['Twin', 478.8, 103.44],
      ['Twin XL', 478.8, 103.44],
      ['Full', 502.8, 109.73],
      ['Queen', 502.8, 109.73],
      ['King', 538.8, 95.26],
      ['Split King', 562.8, 95.26],
      ['Split-head King', 562.8, 200.71],
      ['Cal King', 538.8, 95.26],
      ['Split Cal King', 562.8, 95.26],
    ],
  },
  {
    brand: 'Meridian',
    model: 'Sturdy Haven Platform Frame',
    category: 'frame',
    sku: '365095',
    sizes: [
      ['Twin', 215.99, 67.19],
      ['Twin XL', 215.99, 67.19],
      ['Full', 227.99, 75.59],
      ['Queen', 239.99, 83.99],
      ['King', 263.99, 100.79],
    ],
  },
  {
    brand: 'Cambria',
    model: 'Gentle Drift Base',
    category: 'adjustable-base',
    sku: '365028',
    sizes: [
      ['Twin', 359.99, 120, 66],
      ['Twin XL', 359.99, 120, 66],
      ['Full', 359.99, 120, 66],
      ['Queen', 359.99, 120, 66],
      ['King 1-piece', 599.99, 198, 108.9],
      ['Cal King 1-piece', 599.99, 198, 108.9],
      ['Split Cal King half', 359.99, 114, 62.7],
    ],
  },
  {
    brand: 'Cambria',
    model: 'Slow Sway Base',
    category: 'adjustable-base',
    sku: '365029',
    sizes: [
      ['Twin', 899.99, 220.8, 132.48],
      ['Twin XL', 899.99, 220.8, 132.48],
      ['Full', 1019.99, 276, 165.6],
      ['Queen', 1019.99, 276, 165.6],
      ['King 1-piece', 1499.99, 386.4, 231.84],
      ['Cal King 1-piece', 1499.99, 386.4, 231.84],
      ['Split Cal King half', 899.99, 220.8, 132.48],
    ],
  },
  {
    brand: 'Cambria',
    model: 'Calm Float Base',
    category: 'adjustable-base',
    sku: '365020',
    sizes: [
      ['Twin', 1199.99, 359.96, 215.98],
      ['Twin XL', 1199.99, 359.96, 215.98],
      ['Full', 1379.99, 420.02, 252.01],
      ['Queen', 1439.99, 420.02, 252.01],
      ['King 1-piece', 1919.99, 588.04, 352.82],
      ['Cal King 1-piece', 1919.99, 588.04, 352.82],
      ['Split Cal King half', 1199.99, 359.96, 215.98],
    ],
  },
  {
    brand: 'Cambria',
    model: 'Grand Glide Base',
    category: 'adjustable-base',
    sku: '366201',
    sizes: [
      ['Twin', 1439.99, 480, 288],
      ['Twin XL', 1439.99, 480, 288],
      ['Full', 1679.99, 600, 360],
      ['Queen', 1679.99, 600, 360],
      ['King 1-piece', 2519.99, 768, 460.8],
      ['Cal King 1-piece', 2519.99, 768, 460.8],
      ['Split Cal King half', 1439.99, 480, 288],
    ],
  },
  {
    brand: 'Meridian',
    model: 'Snug Blanket Protector',
    category: 'protector',
    sku: '366272',
    sizes: [
      ['Twin', 35.99, 7.2],
      ['Twin XL', 35.99, 7.2],
      ['Full', 59.99, 20.75],
      ['Queen', 59.99, 20.75],
      ['King', 83.99, 30.52],
      ['Cal King', 83.99, 30.52],
    ],
  },
  {
    brand: 'Meridian',
    model: 'Crisp Morning Protector',
    category: 'protector',
    sku: '366274',
    sizes: [
      ['Twin', 155.99, 54.71],
      ['Twin XL', 155.99, 54.71],
      ['Full', 179.99, 62.88],
      ['Queen', 179.99, 62.88],
      ['King', 203.99, 71.05],
      ['Cal King', 203.99, 71.05],
    ],
  },
  {
    brand: 'Guardian',
    model: 'Night Veil Protector',
    category: 'protector',
    sku: '365927',
    sizes: [
      ['Twin', 298.8, 52.57],
      ['Twin XL', 310.8, 55.08],
      ['Full', 322.8, 57.6],
      ['Queen', 346.8, 60.11],
      ['King', 370.8, 65.15],
      ['Split-head King', 394.8, 140.35],
      ['Dual King', 394.8, 70.18],
      ['Cal King', 370.8, 65.15],
      ['Split Cal King half', 394.8, 70.18],
    ],
  },
]

export const CATALOG: Product[] = LINES.flatMap((line) =>
  line.sizes.map(([size, price, cost, outletCost]) => {
    const product: Product = {
      sku: `${line.sku}-${SIZE_CODES[size]}`,
      modelSku: line.sku,
      brand: line.brand,
      model: line.model,
      category: line.category,
      size,
      listCents: dollars(price),
      costCents: dollars(cost),
    }
    // The store's rule: an outlet (pre-owned) piece starts at 20% off the new
    // price and can never sell for more than that.
    if (outletCost !== undefined) {
      product.outlet = { listCents: applyBp(dollars(price), OUTLET_PRICE_BP), costCents: dollars(outletCost) }
    }
    return product
  }),
)

/** The models the maker won't let stores discount, by their shared SKU. */
export const LOCKED_MODELS: string[] = LINES.filter((l) => l.locked).map((l) => l.sku)

export const CATEGORY_LABELS: Record<Category, string> = {
  mattress: 'Mattresses',
  foundation: 'Foundations',
  'adjustable-base': 'Adjustable bases',
  frame: 'Frames',
  pillow: 'Pillows',
  protector: 'Protectors',
  sheets: 'Sheets',
}

export const CATEGORY_SINGULAR: Record<Category, string> = {
  mattress: 'mattress',
  foundation: 'foundation',
  'adjustable-base': 'adjustable base',
  frame: 'frame',
  pillow: 'pillow',
  protector: 'protector',
  sheets: 'sheet set',
}

export function productName(p: Product): string {
  return [p.brand, p.model, p.size ? `(${p.size})` : ''].filter(Boolean).join(' ')
}

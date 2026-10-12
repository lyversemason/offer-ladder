// Six months of made-up sales history for the reports (April through September
// 2026). Every sale is priced by the real engine: the bundle is built, the offer
// ladder is worked out, and the customer says yes at one of its rungs. A fixed
// random seed makes the history identical on every load.
//
// Each rep has a personality, so the reports tell a story:
//   Tasha   attaches bases and holds her price (top-tier heavy)
//   Kevin   jumps to discounts early; many low-tier sales and below-floor asks
//   Renee   converts the most customers, but on smaller tickets
//   Marcus  sells the price-locked premium line (Guardian), with full-price add-ons
//   Andre   middle of the pack
//   Sofia   new hire (April); better every month
//   Ben     big tickets (kings, cal kings, split bases), converts fewer
import {
  buildLadder,
  distribute,
  evaluate,
  financingAdjustment,
  makeCatalog,
  minStepCents,
  sizesFit,
} from '../engine'
import type { Ctx, Deal, DealLine, Evaluation, Product, Settings } from '../engine'
import type { Database, OfferRecord, SqlJsStatic } from '../db/database'
import {
  createDatabase,
  recordVisit,
  recordWalkOffers,
  saveDeal,
  saveSettings,
  seedCatalog,
  seedOrg,
} from '../db/database'
import { CATALOG } from './catalog'
import { REPS, STORES } from './org'
import { DEFAULT_SETTINGS } from './settings'
import { between, pick, seeded, weighted } from './random'
import type { Rand } from './random'

export const HISTORY_START = '2026-04-01'
export const HISTORY_END = '2026-09-30'
const SEED = 20261011

type Brand = 'Guardian' | 'Bakersville' | 'Century' | 'Optima' | 'Georgia' | 'Futura' | 'Meridian'
type Size = 'Twin' | 'Twin XL' | 'Full' | 'Queen' | 'King' | 'Cal King'

/** A value that can change from the first month to the last (for the new hire). */
type Ramp = number | [first: number, last: number]

interface Profile {
  hiredOn: string
  /** Weekdays off, 0 = Sunday. */
  daysOff: number[]
  ups: [min: number, max: number]
  conversion: Ramp
  brands: Partial<Record<Brand, number>>
  sizes: Partial<Record<Size, number>>
  baseAttach: Ramp
  proBase: number
  pillow: number
  protector: number
  sheets: number
  delivery: number
  financing: number
  outlet: number
  /** Ladder rung the rep opens with (0 = asking price; 2 = skips the top-tier offer). */
  startRung: number
  /** Chance the customer says yes at each offer. */
  accept: Ramp
  /** Chance of asking for a below-floor price when the ladder runs out. */
  belowFloor: Ramp
}

const NORMAL_SIZES: Partial<Record<Size, number>> = { Queen: 52, King: 25, Full: 10, 'Twin XL': 5, Twin: 4, 'Cal King': 4 }
const NORMAL_BRANDS: Partial<Record<Brand, number>> = {
  Guardian: 12,
  Bakersville: 6,
  Century: 10,
  Optima: 8,
  Georgia: 24,
  Futura: 8,
  Meridian: 32,
}

const AVERAGE: Profile = {
  hiredOn: '2024-06-03',
  daysOff: [2, 3],
  ups: [2, 4],
  conversion: 0.45,
  brands: NORMAL_BRANDS,
  sizes: NORMAL_SIZES,
  baseAttach: 0.27,
  proBase: 0.35,
  pillow: 0.55,
  protector: 0.55,
  sheets: 0.2,
  delivery: 0.85,
  financing: 0.25,
  outlet: 0.08,
  startRung: 1,
  accept: 0.33,
  belowFloor: 0.03,
}

export const PROFILES: Record<string, Profile> = {
  tasha: { ...AVERAGE, hiredOn: '2023-02-13', daysOff: [1, 2], baseAttach: 0.6, proBase: 0.5, accept: 0.65, belowFloor: 0 },
  kevin: { ...AVERAGE, hiredOn: '2024-09-16', daysOff: [3, 4], baseAttach: 0.18, startRung: 2, accept: 0.22, belowFloor: 0.3 },
  renee: {
    ...AVERAGE,
    hiredOn: '2023-11-06',
    daysOff: [4, 5],
    ups: [3, 5],
    conversion: 0.62,
    brands: { Guardian: 3, Century: 4, Optima: 10, Georgia: 30, Futura: 8, Meridian: 45 },
    sizes: { Queen: 50, Full: 20, Twin: 10, 'Twin XL': 5, King: 15 },
    baseAttach: 0.12,
    accept: 0.42,
    pillow: 0.4,
    protector: 0.45,
    financing: 0.15,
  },
  marcus: {
    ...AVERAGE,
    hiredOn: '2022-08-22',
    daysOff: [0, 1],
    brands: { Guardian: 45, Bakersville: 12, Century: 5, Georgia: 20, Futura: 13, Meridian: 5 },
    baseAttach: 0.4,
    pillow: 0.8,
    protector: 0.85,
    sheets: 0.4,
    accept: 0.36,
    belowFloor: 0.01,
  },
  andre: { ...AVERAGE, hiredOn: '2024-01-08', daysOff: [5, 6] },
  sofia: {
    ...AVERAGE,
    hiredOn: '2026-04-01',
    daysOff: [1, 4],
    conversion: [0.24, 0.56],
    baseAttach: [0.08, 0.4],
    accept: [0.2, 0.42],
    belowFloor: [0.15, 0.02],
    protector: 0.4,
  },
  ben: {
    ...AVERAGE,
    hiredOn: '2023-05-15',
    daysOff: [2, 6],
    ups: [2, 3],
    conversion: 0.33,
    brands: { Guardian: 25, Bakersville: 15, Century: 35, Optima: 15, Georgia: 10 },
    sizes: { King: 55, 'Cal King': 12, Queen: 31, Full: 2 },
    baseAttach: 0.42,
    proBase: 0.75,
    financing: 0.45,
  },
}

/** Reps with their hire dates, for the reps table. */
export const REPS_WITH_HIRE_DATES = REPS.map((r) => ({ ...r, hiredOn: PROFILES[r.id].hiredOn }))

export interface HistorySummary {
  visits: { repId: string; storeId: string; date: string; sold: boolean }[]
  deals: {
    repId: string
    storeId: string
    date: string
    toplineCents: number
    grossCents: number
    commissionCents: number
    attach: boolean
    tierId: string | null
    closedAtRung: number
  }[]
  belowFloorOffers: { repId: string; date: string }[]
}

/** Every day from start to end, as 'YYYY-MM-DD'. */
function days(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = new Date(`${start}T12:00:00Z`); d <= new Date(`${end}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** How far through the six months a date is: 0 on the first day, 1 on the last. */
function progress(date: string): number {
  const start = Date.parse(HISTORY_START)
  return (Date.parse(date) - start) / (Date.parse(HISTORY_END) - start)
}

function ramp(value: Ramp, date: string): number {
  if (typeof value === 'number') return value
  const [first, last] = value
  return first + (last - first) * progress(date)
}

/** The products of one model in the size that fits the bed (exact size first). */
function forBed(products: Product[], model: string, bed: string): Product | undefined {
  const sizes = products.filter((x) => x.model === model)
  return sizes.find((x) => x.size === bed) ?? sizes.find((x) => x.size && sizesFit(x.size, bed))
}

/** What a foundation or base comes in for each bed: one piece, or two halves. */
const SUPPORT_SIZES: Record<Size, { one: string; half?: string }> = {
  Twin: { one: 'Twin' },
  'Twin XL': { one: 'Twin XL' },
  Full: { one: 'Full' },
  Queen: { one: 'Queen' },
  King: { one: 'King 1-piece', half: 'Twin XL' },
  'Cal King': { one: 'Cal King 1-piece', half: 'Split Cal King half' },
}

/** Builds the bundle a customer wants: a mattress and whatever goes with it. */
function buildBundle(rand: Rand, p: Profile, date: string, ctx: Ctx, products: Product[]): Deal {
  const lines: DealLine[] = []
  let n = 0
  const add = (item: Product | undefined, extra: Partial<DealLine> = {}) => {
    if (!item) return false
    lines.push({ id: `l${++n}`, sku: item.sku, condition: 'new', qty: 1, discountCents: 0, ...extra })
    return true
  }

  const brand = weighted(rand, p.brands)
  const wanted = weighted(rand, p.sizes)
  const mattresses = products.filter((x) => x.category === 'mattress' && x.brand === brand)
  const sized = mattresses.filter((x) => x.size === wanted)
  const mattress = pick(rand, sized.length ? sized : mattresses.filter((x) => x.size === 'Queen'))
  const bed = mattress.size as Size
  const useOutlet = mattress.outlet && rand() < p.outlet
  add(mattress, useOutlet ? { condition: 'outlet' } : {})

  // A Guardian mattress only goes on Guardian foundations and bases.
  const guardian = brand === 'Guardian'
  const bigBed = bed === 'Queen' || bed === 'King' || bed === 'Cal King'
  const split = SUPPORT_SIZES[bed]
  const addSupport = (model: string) => {
    if (split.half && rand() < 0.3) return add(forBed(products, model, split.half), { qty: 2 })
    // A King foundation only comes as two Twin XL halves.
    return add(products.find((x) => x.model === model && x.size === split.one)) ||
      (split.half ? add(forBed(products, model, split.half), { qty: 2 }) : false)
  }
  let hasBase = false
  let hasFoundation = false
  if (bigBed && rand() < ramp(p.baseAttach, date)) {
    const pro = rand() < p.proBase
    const model = guardian || rand() < 0.1
      ? pick(rand, pro ? ['Silent Orbit Base', 'Grand Orbit Base'] : ['Calm Orbit Base', 'Soft Eclipse Base'])
      : pick(rand, pro ? ['Grand Glide Base', 'Calm Float Base'] : ['Gentle Drift Base', 'Slow Sway Base'])
    hasBase = addSupport(model)
  }
  if (!hasBase && rand() < 0.45) {
    const model = guardian ? 'Deep Midnight Foundation' : brand === 'Century' ? 'Deep Hearth Foundation' : 'Snug Cottage Foundation'
    hasFoundation = addSupport(model)
  }
  if (!hasBase && !hasFoundation && rand() < 0.15) add(forBed(products, 'Sturdy Haven Platform Frame', bed))

  let pillows = 0
  if (rand() < p.pillow) {
    pillows = rand() < 0.6 ? 2 : 1
    const model =
      guardian && rand() < 0.5 ? 'Hushed Nebula Pillow' : brand === 'Futura' && rand() < 0.5 ? 'Fern Valley Pillow' : 'Cozy Nook Pillow'
    add(forBed(products, model, bed === 'King' || bed === 'Cal King' ? 'King' : 'Queen'), { qty: pillows })
  }
  let hasProtector = false
  if (rand() < p.protector) {
    const model =
      guardian && rand() < 0.5 ? 'Night Veil Protector' : bigBed && rand() < 0.3 ? 'Crisp Morning Protector' : 'Snug Blanket Protector'
    hasProtector = add(forBed(products, model, bed))
  }
  if (bigBed && rand() < p.sheets) {
    const model = guardian ? 'Pale Aurora Sheet Set' : brand === 'Futura' ? 'Birch Grove Sheet Set' : 'Soft Linen Sheet Set'
    add(forBed(products, model, bed))
  }

  let delivery: Deal['delivery'] = null
  if (rand() < p.delivery) {
    const tierId = hasBase && rand() < 0.7 ? 'diamond' : weighted(rand, { gold: 55, platinum: 20, silver: 25 })
    const tier = ctx.settings.deliveryTiers.find((t) => t.id === tierId)!
    delivery = { tierId, priceCents: tier.priceCents }
  }

  const bundleDealIds: string[] = []
  if (pillows >= 2) bundleDealIds.push('pillow-2nd-half')
  if (hasProtector && rand() < 0.5) bundleDealIds.push('protector-with-mattress')
  if (hasFoundation && rand() < 0.6) bundleDealIds.push('foundation-with-mattress')

  const deal: Deal = { lines, delivery, financingMonths: null, bundleDealIds }
  if (rand() < p.financing) {
    const asking = evaluate(deal, ctx).toplineCents
    const term = weighted(rand, { '6': 10, '12': 30, '24': 25, '36': 18, '48': 10, '60': 5, '72': 2 })
    if (financingAdjustment(ctx.settings, Number(term), asking) !== null) deal.financingMonths = Number(term)
  }
  return deal
}

function toOffer(ev: Evaluation, accepted: boolean): OfferRecord {
  return {
    toplineCents: ev.toplineCents,
    marginBp: ev.marginBp,
    tierId: ev.tier?.id ?? null,
    commissionCents: ev.commissionCents,
    accepted,
  }
}

/** The price one minimum step under the final offer: below the floor. */
function belowFloorOffer(deal: Deal, finalEv: Evaluation, ctx: Ctx): Evaluation | null {
  const base: Deal = { ...deal, lines: deal.lines.map((l) => ({ ...l, discountCents: 0 })) }
  const baseEv = evaluate(base, ctx)
  const cut = baseEv.toplineCents - finalEv.toplineCents + minStepCents(finalEv.toplineCents, ctx.settings)
  const lower = distribute(base, cut, 'spread', ctx)
  const ev = evaluate(lower.deal, ctx)
  return ev.tier === null && ev.toplineCents < finalEv.toplineCents ? ev : null
}

/**
 * Fills a database (already created and seeded) with the demo history.
 * Returns a plain summary of what was written, for tests to check the reports.
 */
export function fillHistory(
  db: Database,
  opts: { settings?: Settings; products?: Product[]; seed?: number } = {},
): HistorySummary {
  const settings = opts.settings ?? DEFAULT_SETTINGS
  const products = opts.products ?? CATALOG
  const catalog = makeCatalog(products) as Map<string, Product>
  const ctx: Ctx = { catalog, settings }
  const rand = seeded(opts.seed ?? SEED)
  const summary: HistorySummary = { visits: [], deals: [], belowFloorOffers: [] }

  db.run('BEGIN')
  try {
    for (const date of days(HISTORY_START, HISTORY_END)) {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
      const weekend = weekday === 0 || weekday === 6
      for (const rep of REPS) {
        const p = PROFILES[rep.id]
        if (date < p.hiredOn || p.daysOff.includes(weekday)) continue
        const ups = between(rand, p.ups[0], p.ups[1]) + (weekend ? 1 : 0)
        for (let u = 0; u < ups; u++) {
          const sold = rand() < ramp(p.conversion, date)
          const deal = buildBundle(rand, p, date, ctx, products)
          const ladder = buildLadder(deal, ctx)
          const rungs = ladder.rungs.filter((r) => r.ev.ok)
          // The rep opens at their usual rung (Kevin skips the top-tier offer).
          // A deal with no room to negotiate only has its asking price.
          const from = Math.min(Math.max(1, p.startRung), rungs.length - 1)
          const shown = rungs.length === 0 ? [] : from >= 1 ? [rungs[0], ...rungs.slice(from)] : [rungs[0]]
          const accept = ramp(p.accept, date)

          if (!sold || shown.length === 0) {
            const visitId = recordVisit(db, { repId: rep.id, storeId: rep.storeId, date, sold: false })
            summary.visits.push({ repId: rep.id, storeId: rep.storeId, date, sold: false })
            if (shown.length && rand() < 0.6) {
              const heard = shown.slice(0, between(rand, 1, shown.length))
              recordWalkOffers(db, visitId, heard.map((r) => toOffer(r.ev, false)))
            }
            continue
          }

          // Walk down the offers until the customer says yes (or the last one).
          // Few customers take the asking price; most want at least one offer.
          let at = 0
          while (at < shown.length - 1 && rand() >= (at === 0 ? accept * 0.35 : accept)) at++
          const closing = shown[at]
          const offers = shown.slice(0, at + 1).map((r, i) => toOffer(r.ev, i === at))

          // At the last offer, some reps ask for a below-floor price (declined).
          if (at === shown.length - 1 && at > 0 && rand() < ramp(p.belowFloor, date)) {
            const below = belowFloorOffer(closing.deal, closing.ev, ctx)
            if (below) {
              offers.push(toOffer(below, false))
              summary.belowFloorOffers.push({ repId: rep.id, date })
            }
          }

          saveDeal(db, {
            repId: rep.id,
            storeId: rep.storeId,
            date,
            deal: closing.deal,
            ev: closing.ev,
            offers,
            closedAtRung: at,
          })
          summary.visits.push({ repId: rep.id, storeId: rep.storeId, date, sold: true })
          summary.deals.push({
            repId: rep.id,
            storeId: rep.storeId,
            date,
            toplineCents: closing.ev.toplineCents,
            grossCents: closing.ev.grossCents,
            commissionCents: closing.ev.commissionCents,
            attach: closing.ev.attach,
            tierId: closing.ev.tier?.id ?? null,
            closedAtRung: at,
          })
        }
      }
    }
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  return summary
}

/** A brand-new demo database: tables, stores, reps, catalog, rules and history. */
export function buildDemoDatabase(SQL: SqlJsStatic): { db: Database; summary: HistorySummary } {
  const db = createDatabase(SQL)
  seedOrg(db, STORES, REPS_WITH_HIRE_DATES)
  seedCatalog(db, CATALOG)
  saveSettings(db, `${HISTORY_START} 08:00`, DEFAULT_SETTINGS)
  const summary = fillHistory(db)
  return { db, summary }
}

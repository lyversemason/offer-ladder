// Six months of made-up sales history for the reports (April through September
// 2026). Every sale is priced by the real engine: the bundle is built, the rep
// steps the price down (ladder.ts), and the customer says yes at one of the offers. A fixed
// random seed makes the history identical on every load.
//
// Since v0.15.0 it also writes what the app would have recorded: every offer line
// by line, the usage events of each ticket, and the store's own count of customers
// (traffic). How reps use the app, how they build offers and how customers react
// to them are in habits.ts; those patterns are planted on purpose.
//
// Each rep has a personality, so the reports tell a story:
//   Tasha   attaches bases and holds her price (top-tier heavy)
//   Kevin   jumps to discounts early; many low-tier sales, and sales under the
//           exceptions margin
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
import type { Database, DiscountHow, EventRecord, OfferRecord, SqlJsStatic } from '../db/database'
import {
  createDatabase,
  logEvents,
  recordTraffic,
  recordVisit,
  recordWalkOffers,
  saveDeal,
  saveSettings,
  addAudit,
  readPeople,
  savePeople,
  seedCatalog,
  seedOrg,
} from '../db/database'
import { acceptLift, addHowAt, buildOffer, deliveryIsFree, BIG_TICKET_CENTS, HABITS, rampAt, saleLift } from './habits'
import type { BuiltOffer, Style, Via } from './habits'
import { CATALOG } from './catalog'
import { PEOPLE, REPS, STORES } from './org'
import { seedAudit, seedPeople } from './accounts'
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
  /** Chance of going one more step under the last offer (the exceptions margin) to close. */
  underFinal: Ramp
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
  underFinal: 0.03,
}

export const PROFILES: Record<string, Profile> = {
  tasha: { ...AVERAGE, hiredOn: '2023-02-13', daysOff: [1, 2], baseAttach: 0.65, proBase: 0.5, accept: 0.65, underFinal: 0 },
  kevin: { ...AVERAGE, hiredOn: '2024-09-16', daysOff: [3, 4], baseAttach: 0.18, startRung: 2, accept: 0.22, underFinal: 0.3 },
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
    underFinal: 0.01,
  },
  andre: { ...AVERAGE, hiredOn: '2024-01-08', daysOff: [5, 6] },
  sofia: {
    ...AVERAGE,
    hiredOn: '2026-04-01',
    daysOff: [1, 4],
    conversion: [0.24, 0.56],
    baseAttach: [0.08, 0.4],
    accept: [0.2, 0.42],
    underFinal: [0.15, 0.02],
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
  /** Customers recorded in the app (a sale, or a walk-out the rep recorded). */
  visits: { repId: string; storeId: string; date: string; sold: boolean }[]
  /** Every customer each rep helped, as the store counts them (with or without the app). */
  traffic: { repId: string; date: string; ups: number }[]
  /** Customers the rep used the app with (a ticket was started). */
  tickets: number
  /** How many usage events were written. */
  events: number
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
  /** Sales closed one step under the exceptions margin. */
  underFinalSales: { repId: string; date: string }[]
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
  if (rand() < p.protector) {
    const model =
      guardian && rand() < 0.5 ? 'Night Veil Protector' : bigBed && rand() < 0.3 ? 'Crisp Morning Protector' : 'Snug Blanket Protector'
    add(forBed(products, model, bed))
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

  const deal: Deal = { lines, delivery, financingMonths: null }
  if (rand() < p.financing) {
    const asking = evaluate(deal, ctx).toplineCents
    const term = weighted(rand, { '6': 20, '12': 30, '24': 25, '36': 18, '48': 10, '60': 5, '72': 2 })
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

/** Why-discount reasons a customer might have, besides financing and a review. */
const GROUP_REASONS = ['Military', 'Police, fire or EMS', 'Government', 'Healthcare', 'Teacher', 'Student']

/** An offer as the app saves it: the totals plus every line, delivery, financing and reasons. */
function toFullOffer(o: BuiltOffer, accepted: boolean, reasons: string[]): OfferRecord {
  const ev = o.ev
  return {
    ...toOffer(ev, accepted),
    detail: {
      lines: ev.lines.map((l) => ({
        sku: l.product.sku,
        condition: l.condition,
        qty: l.qty,
        listCents: l.listCents,
        discountCents: l.discountCents,
        netCents: l.netCents,
        costCents: l.costCents,
        locked: l.locked,
        discountHow: l.discountCents !== 0 ? (o.via[l.lineId]?.how ?? null) : null,
        discountScope: l.discountCents !== 0 ? (o.via[l.lineId]?.scope ?? null) : null,
      })),
      delivery: o.deal.delivery ? { tierId: o.deal.delivery.tierId, listCents: ev.deliveryListCents, priceCents: ev.deliveryPriceCents } : null,
      financingMonths: o.deal.financingMonths,
      reasons,
    },
  }
}

/** 'YYYY-MM-DD HH:MM:SS' from a date and minutes after midnight. */
function at(date: string, minutes: number): string {
  const secs = Math.floor(minutes * 60)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date} ${p(Math.floor(secs / 3600))}:${p(Math.floor(secs / 60) % 60)}:${p(secs % 60)}`
}

/**
 * One minimum step under the last offer: still a sale that makes money, but
 * under the margin the ladder stops at. Null when there's no room left.
 */
function underFinalOffer(deal: Deal, finalEv: Evaluation, ctx: Ctx): { deal: Deal; ev: Evaluation } | null {
  const cut = minStepCents(finalEv.toplineCents)
  const lower = distribute(deal, cut, 'spread', ctx)
  const ev = evaluate(lower.deal, ctx)
  return ev.ok && lower.appliedCents === cut ? { deal: lower.deal, ev } : null
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
  const summary: HistorySummary = { visits: [], traffic: [], tickets: 0, events: 0, deals: [], underFinalSales: [] }
  const events: EventRecord[] = []
  let ticketNo = 0

  db.run('BEGIN')
  try {
    for (const date of days(HISTORY_START, HISTORY_END)) {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
      const weekend = weekday === 0 || weekday === 6
      const t = progress(date)
      for (const rep of REPS) {
        const p = PROFILES[rep.id]
        const h = HABITS[rep.id]
        if (date < p.hiredOn || p.daysOff.includes(weekday)) continue
        const ups = between(rand, p.ups[0], p.ups[1]) + (weekend ? 1 : 0)
        recordTraffic(db, { day: date, repId: rep.id, storeId: rep.storeId, ups })
        summary.traffic.push({ repId: rep.id, date, ups })

        // When each customer walks in (minutes after midnight; the store opens at 10).
        const arrivals = Array.from({ length: ups }, () => 600 + rand() * 540).sort((a, b) => a - b)
        // The rep's sitting in the app: a new one after 30 quiet minutes.
        let session: { id: string; lastAt: number } | null = null
        let sessionNo = 0
        let busyUntil = 0

        for (let u = 0; u < ups; u++) {
          // Some customers are helped without the app: the store counts them, the app never knows.
          if (rand() >= rampAt(h.coverage, t)) continue

          const deal = buildBundle(rand, p, date, ctx, products)
          const ladder = buildLadder(deal, ctx)
          const rungs = ladder.rungs.filter((r) => r.ev.ok)
          // The rep opens at their usual rung (Kevin skips the top-tier offer).
          // A deal with no room to negotiate only has its asking price.
          const from = Math.min(Math.max(1, p.startRung), rungs.length - 1)
          const shown = rungs.length === 0 ? [] : from >= 1 ? [rungs[0], ...rungs.slice(from)] : [rungs[0]]
          const accept = ramp(p.accept, date)

          // How this rep puts each offer together (same prices, different lines).
          const askingEv = shown[0]?.ev ?? evaluate(deal, ctx)
          let style = weighted<Style>(rand, h.styles)
          if (style === 'base' && !askingEv.lines.some((l) => l.product.category === 'adjustable-base' && !l.locked)) style = 'spread'
          if (style === 'delivery' && !(deal.delivery && deal.delivery.priceCents > 0)) style = 'spread'
          const hows = { row: weighted<DiscountHow>(rand, h.discountHow), ticket: weighted<DiscountHow>(rand, h.discountHow) }
          const built: BuiltOffer[] = shown.map((r, i) =>
            i === 0 ? { deal: r.deal, ev: r.ev, via: {} } : buildOffer(shown[0].deal, r, style, hows, h.baseCutBp, ctx),
          )

          // Whether they buy depends on the rep's conversion and on what's offered (planted).
          const lift = saleLift({
            askingCents: askingEv.toplineCents,
            freeDelivery: built.some((o) => deliveryIsFree(o.deal, ctx)),
            financingMonths: deal.financingMonths,
          })
          const sold = shown.length > 0 && rand() < Math.min(0.95, ramp(p.conversion, date) * lift)
          const big = askingEv.toplineCents >= BIG_TICKET_CENTS

          // Which offers the customer hears, and which one they take.
          let said: BuiltOffer[]
          if (sold) {
            let pos = 0
            while (pos < built.length - 1) {
              let pYes = pos === 0 ? accept * 0.35 : accept
              if (pos > 0) pYes = Math.min(0.95, pYes * acceptLift(built[pos], built[pos - 1], big, ctx))
              if (rand() < pYes) break
              pos++
            }
            said = built.slice(0, pos + 1)
            // At the final offer, some reps go one more step to close (any sale
            // that makes money is allowed, but it's under the exceptions margin).
            const last = said[said.length - 1]
            if (pos === built.length - 1 && pos > 0 && rand() < ramp(p.underFinal, date)) {
              const under = underFinalOffer(last.deal, last.ev, ctx)
              if (under) {
                const via: Record<string, Via> = { ...last.via }
                for (const l of under.deal.lines) if (l.discountCents !== 0 && !via[l.id]) via[l.id] = { how: hows.ticket, scope: 'ticket' }
                said = [...said, { deal: under.deal, ev: under.ev, via }]
                summary.underFinalSales.push({ repId: rep.id, date })
              }
            }
          } else {
            said = built.slice(0, built.length ? between(rand, 1, built.length) : 0)
          }

          // ---- The ticket, as the app records it --------------------------------
          const ticketId = `h-${++ticketNo}`
          summary.tickets++
          let now = Math.max(arrivals[u], busyUntil + 1)
          const ticketStart = now
          const emit = (type: string, d: Partial<EventRecord> = {}, onTicket = true) => {
            if (!session || now - session.lastAt > 30) {
              session = { id: `hs-${rep.id}-${date}-${++sessionNo}`, lastAt: now }
              events.push({ at: at(date, now), repId: rep.id, storeId: rep.storeId, sessionId: session.id, ticketId: null, type: 'session_started' })
            }
            events.push({ at: at(date, now), repId: rep.id, storeId: rep.storeId, sessionId: session.id, ticketId: onTicket ? ticketId : null, type, ...d })
            session.lastAt = now
          }
          const wait = (min: number, max: number) => (now += min + rand() * (max - min))

          let started = false
          let lookupOpen = false
          let inventoryOpen = false
          for (const line of deal.lines) {
            const how = addHowAt(h, rand, t)
            if (how === 'lookup' && !lookupOpen) {
              emit('lookup_opened', {}, started)
              lookupOpen = true
            }
            if (how === 'inventory' && !inventoryOpen) {
              emit('inventory_opened', {}, started)
              inventoryOpen = true
            }
            if (!started) {
              emit('ticket_started')
              started = true
            }
            emit('item_added', { how, sku: line.sku })
            wait(0.3, 1.5)
          }
          if (deal.delivery) emit('delivery_set', { how: deal.delivery.tierId })
          if (deal.financingMonths) emit('financing_set', { how: 'financing', value: deal.financingMonths })
          if (rand() < h.gm) {
            wait(0.5, 2)
            emit('gm_calculator_opened')
          }

          const reasons: string[] = []
          if (deal.financingMonths && rand() < 0.6) reasons.push('Financing')
          if (rand() < 0.22) reasons.push(pick(rand, GROUP_REASONS))
          if (rand() < 0.15) reasons.push('Google review')
          const floorHit = rand() < h.floorHit

          // The offers after the asking price, each with the price changes that made it.
          now = Math.max(now, ticketStart + rampAt(h.firstOffer, t) * (0.6 + rand() * 0.8))
          const recorded: BuiltOffer[] = []
          for (let i = 1; i < said.length; i++) {
            const o = said[i]
            const prev = said[i - 1]
            const scratch = between(rand, h.scratch[0], h.scratch[1])
            for (let k = 0; k < scratch; k++) {
              emit('discount_applied', { how: hows.ticket, scope: 'ticket', value: Math.round(o.ev.savingsCents * (0.5 + rand())) })
              wait(0.2, 1)
            }
            if (o.ev.deliveryPriceCents !== prev.ev.deliveryPriceCents) {
              emit('discount_applied', { how: 'new_price', scope: 'delivery', value: o.ev.deliveryListCents - o.ev.deliveryPriceCents })
            }
            const changed = o.ev.lines.filter((l, n) => l.discountCents !== prev.ev.lines[n]?.discountCents)
            for (const l of changed.filter((l) => o.via[l.lineId]?.scope === 'row')) {
              emit('discount_applied', { how: hows.row, scope: 'row', sku: l.product.sku, value: l.discountCents })
            }
            if (changed.some((l) => o.via[l.lineId]?.scope !== 'row')) {
              emit('discount_applied', { how: hows.ticket, scope: 'ticket', value: o.ev.savingsCents })
            }
            if (floorHit && i === said.length - 1) {
              emit('floor_refused', { scope: 'ticket', value: o.ev.toplineCents - minStepCents(o.ev.toplineCents) * 3 })
            }
            if (i === 1) for (const r of reasons) emit('reason_added', { how: r })
            const isAccepted = sold && i === said.length - 1
            if (!isAccepted && rand() < h.recordOffer) {
              recorded.push(o)
              emit('offer_recorded', { value: recorded.length })
            }
            wait(2, 7)
          }

          // ---- How it ended -------------------------------------------------------
          const reasonsAt = (o: BuiltOffer) => (o === said[0] ? [] : reasons)
          if (sold) {
            const closing = said[said.length - 1]
            const list = closing === said[0] ? [closing] : [said[0], ...recorded, closing]
            const offers = list.map((o) => toFullOffer(o, o === closing, reasonsAt(o)))
            const closedAtRung = list.length - 1
            emit('outcome_recorded', { how: 'bought', value: closedAtRung })
            saveDeal(db, {
              repId: rep.id,
              storeId: rep.storeId,
              date,
              deal: closing.deal,
              ev: closing.ev,
              offers,
              closedAtRung,
              ticketId,
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
              closedAtRung,
            })
          } else if (rand() < h.recordWalk) {
            const list = said.length ? [said[0], ...recorded] : []
            emit('outcome_recorded', { how: 'walked', value: Math.max(0, list.length - 1) })
            const visitId = recordVisit(db, { repId: rep.id, storeId: rep.storeId, date, sold: false, ticketId })
            if (list.length) recordWalkOffers(db, visitId, list.map((o) => toFullOffer(o, false, reasonsAt(o))))
            summary.visits.push({ repId: rep.id, storeId: rep.storeId, date, sold: false })
          } else {
            // The rep moved on without recording it: the app only sees a dropped ticket.
            emit('ticket_abandoned', { value: recorded.length })
          }
          busyUntil = now + 2 + rand() * 4
        }
      }
    }
    logEvents(db, events)
    summary.events = events.length
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  return summary
}

/** The people who can sign in, and their account history in the audit log (empty tables only). */
export function seedAccounts(db: Database) {
  if (readPeople(db).length) return
  const people = seedPeople(PEOPLE)
  savePeople(db, people)
  addAudit(db, seedAudit(people))
}

/** A brand-new demo database: tables, stores, reps, catalog, rules and history. */
export function buildDemoDatabase(SQL: SqlJsStatic): { db: Database; summary: HistorySummary } {
  const db = createDatabase(SQL)
  seedOrg(db, STORES, REPS_WITH_HIRE_DATES)
  seedCatalog(db, CATALOG)
  saveSettings(db, `${HISTORY_START} 08:00`, DEFAULT_SETTINGS)
  seedAccounts(db)
  const summary = fillHistory(db)
  return { db, summary }
}

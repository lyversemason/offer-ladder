// Turning what a rep's screen sends into exactly what gets saved. Every offer is
// priced again with the engine from its items (SKUs, quantities, discounts,
// delivery, financing), so the totals saved are always the engine's, never a
// browser's. Used by the demo source and by the live server (server/save.ts), so
// the two can't disagree. No database code here.
import { evaluate } from '../engine'
import type { Condition, Ctx, Deal, Evaluation } from '../engine'
import type { DiscountHow, DiscountScope, OfferDetail, OfferRecord } from '../db/database'
import type { Outcome } from '../source/types'

/** A refusal, with the reason in plain words (shown to the rep). */
export class OutcomeError extends Error {}

export interface PricedOutcome {
  /** Every offer as the engine prices it, in order; the sale's is last and accepted. */
  offers: OfferRecord[]
  /** The sale, priced by the engine (null when the customer walked). */
  sale: { deal: Deal; ev: Evaluation } | null
}

const HOWS: DiscountHow[] = ['dollars', 'percent', 'new_price']
const SCOPES: DiscountScope[] = ['row', 'ticket']
const MAX_OFFERS = 50

const CONDITIONS: Condition[] = ['new', 'outlet']

/** The ticket an offer describes, as the engine takes it. */
export function dealFromDetail(d: OfferDetail): Deal {
  return {
    lines: d.lines.map((l, i) => {
      if (!CONDITIONS.includes(l.condition as Condition)) throw new OutcomeError(`An item has an unknown condition: ${String(l.condition)}`)
      return { id: `l${i + 1}`, sku: String(l.sku), condition: l.condition as Condition, qty: Number(l.qty), discountCents: Number(l.discountCents) }
    }),
    delivery: d.delivery ? { tierId: String(d.delivery.tierId), priceCents: Number(d.delivery.priceCents) } : null,
    financingMonths: d.financingMonths ?? null,
  }
}

/** One offer priced again: the engine's totals and lines; how each discount was typed and the reasons, as sent. */
function priceOffer(sent: OfferRecord, step: number, ctx: Ctx): { record: OfferRecord; deal: Deal; ev: Evaluation } {
  const d = sent.detail
  if (!d || !Array.isArray(d.lines) || !d.lines.length) throw new OutcomeError(`Offer ${step + 1} has no items.`)
  const deal = dealFromDetail(d)
  const ev = evaluate(deal, ctx)
  const unknown = ev.issues.find((i) => i.code === 'unknown-sku')
  if (unknown) throw new OutcomeError(`An item on offer ${step + 1} isn't in the catalog: ${unknown.message}`)
  if (!ev.ok) throw new OutcomeError(`Offer ${step + 1} breaks the store's rules: ${ev.issues.filter((i) => i.level === 'block').map((i) => i.message).join(' ')}`)
  const detail: OfferDetail = {
    lines: ev.lines.map((l, i) => ({
      sku: l.product.sku,
      condition: l.condition,
      qty: l.qty,
      listCents: l.listCents,
      discountCents: l.discountCents,
      netCents: l.netCents,
      costCents: l.costCents,
      locked: l.locked,
      // How the rep typed it is kept only for a discounted line, and only if it's one of the known ways.
      discountHow: l.discountCents !== 0 && HOWS.includes(d.lines[i]?.discountHow as DiscountHow) ? d.lines[i].discountHow : null,
      discountScope: l.discountCents !== 0 && SCOPES.includes(d.lines[i]?.discountScope as DiscountScope) ? d.lines[i].discountScope : null,
    })),
    delivery: deal.delivery ? { tierId: deal.delivery.tierId, listCents: ev.deliveryListCents, priceCents: ev.deliveryPriceCents } : null,
    financingMonths: deal.financingMonths,
    reasons: (Array.isArray(d.reasons) ? d.reasons : []).map(String).filter((r) => r.length > 0 && r.length <= 60).slice(0, 10),
  }
  const record: OfferRecord = {
    toplineCents: ev.toplineCents,
    marginBp: ev.marginBp,
    tierId: ev.tier?.id ?? null,
    commissionCents: ev.commissionCents,
    accepted: !!sent.accepted,
    detail,
  }
  return { record, deal, ev }
}

/** Checks an outcome and prices every offer again. Throws OutcomeError with the reason if it can't be saved. */
export function priceOutcome(o: Outcome, ctx: Ctx): PricedOutcome {
  if (!o.offers.length) throw new OutcomeError('An outcome needs at least the asking price.')
  if (o.offers.length > MAX_OFFERS) throw new OutcomeError(`An outcome can have at most ${MAX_OFFERS} offers.`)
  const accepted = o.offers.filter((x) => x.accepted).length
  if (o.sale) {
    if (accepted !== 1 || !o.offers[o.offers.length - 1].accepted) throw new OutcomeError('A sale needs its accepted offer last, and only one.')
  } else if (accepted) {
    throw new OutcomeError('A customer who walked accepted no offer.')
  }
  const priced = o.offers.map((x, i) => priceOffer(x, i, ctx))
  if (!o.sale) return { offers: priced.map((p) => p.record), sale: null }
  const closing = priced[priced.length - 1]
  if (evaluate(o.sale, ctx).toplineCents !== closing.ev.toplineCents) throw new OutcomeError("The sale doesn't match its last offer.")
  return { offers: priced.map((p) => p.record), sale: { deal: closing.deal, ev: closing.ev } }
}

type Row = Record<string, unknown>

/** What the live database's save_outcome takes: every row of one outcome, in its columns. */
export interface OutcomeRows {
  visit: { rep_id: string; store_id: string; visited_on: string; sold: boolean; ticket_id: string | null }
  deal: Row | null
  deal_lines: Row[]
  /** Each offer's row, with its lines and reasons. */
  offers: Row[]
}

/** The rows for a priced outcome, the same values the demo's database stores (a test checks). */
export function outcomeRows(o: Outcome, priced: PricedOutcome, date: string): OutcomeRows {
  const sale = priced.sale
  const closedAtRung = sale ? priced.offers.length - 1 : 0
  return {
    visit: { rep_id: o.repId, store_id: o.storeId, visited_on: date, sold: !!sale, ticket_id: o.ticketId ?? null },
    deal: sale && {
      rep_id: o.repId,
      store_id: o.storeId,
      closed_on: date,
      list_topline_cents: sale.ev.listToplineCents,
      topline_cents: sale.ev.toplineCents,
      product_cost_cents: sale.ev.productCostCents,
      delivery_cost_cents: sale.ev.deliveryCostCents,
      gross_cents: sale.ev.grossCents,
      margin_bp: sale.ev.marginBp,
      tier_id: sale.ev.tier?.id ?? null,
      rate_bp: sale.ev.rateBp,
      attach: sale.ev.attach,
      commission_cents: sale.ev.commissionCents,
      financing_months: sale.deal.financingMonths,
      financing_adj_cents: sale.ev.financingAdjCents,
      delivery_tier_id: sale.deal.delivery?.tierId ?? null,
      delivery_price_cents: sale.ev.deliveryPriceCents,
      tax_cents: sale.ev.taxCents,
      offers_made: priced.offers.length - 1,
      closed_at_rung: closedAtRung,
    },
    deal_lines: sale
      ? sale.ev.lines.map((l, i) => ({
          line_no: i + 1,
          sku: l.product.sku,
          condition: l.condition,
          qty: l.qty,
          list_cents: l.listCents,
          discount_cents: l.discountCents,
          net_cents: l.netCents,
          cost_cents: l.costCents,
          locked: l.locked,
        }))
      : [],
    offers: priced.offers.map((r, i) => ({
      step_no: i,
      topline_cents: r.toplineCents,
      margin_bp: r.marginBp,
      tier_id: r.tierId,
      commission_cents: r.commissionCents,
      accepted: r.accepted,
      delivery_tier_id: r.detail?.delivery?.tierId ?? null,
      delivery_list_cents: r.detail?.delivery?.listCents ?? null,
      delivery_price_cents: r.detail?.delivery?.priceCents ?? null,
      financing_months: r.detail?.financingMonths ?? null,
      lines: (r.detail?.lines ?? []).map((l, n) => ({
        line_no: n + 1,
        sku: l.sku,
        condition: l.condition,
        qty: l.qty,
        list_cents: l.listCents,
        discount_cents: l.discountCents,
        net_cents: l.netCents,
        cost_cents: l.costCents,
        locked: l.locked,
        discount_how: l.discountHow,
        discount_scope: l.discountScope,
      })),
      reasons: r.detail?.reasons ?? [],
    })),
  }
}

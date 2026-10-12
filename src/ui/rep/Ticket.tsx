import { useMemo, useState } from 'react'
import {
  applyBp,
  evaluate,
  financingAdjustment,
  formatPct,
  lowestLinePrice,
  lowestTotal,
  offBp,
  priceBundleAt,
  priceCost,
  sellable,
  toplineAfterPctOff,
} from '../../engine'
import type { Condition, Ctx, Deal, Evaluation, LineResult, Product } from '../../engine'
import { DISCOUNT_REASONS } from '../state'
import type { DealAction } from '../state'
import { MoneyInput, PctInput } from '../bits'
import { money, pct } from '../format'

const CONDITION_LABEL: Record<Condition, string> = { new: 'New', outlet: 'Outlet' }

/**
 * A refusal note ("$600 is too low…") that only shows while the ticket is still
 * at the price it was written for, so it disappears once anything changes.
 */
function useNote(toplineCents: number) {
  const [note, setNote] = useState<{ text: string; at: number } | null>(null)
  return [note && note.at === toplineCents ? note.text : null, (text: string | null) => setNote(text === null ? null : { text, at: toplineCents })] as const
}

/** "$600 is too low: …" when a lower price would stop the ticket making money. */
function tooLow(cents: number, lowest: number | null, what: string) {
  return lowest === null
    ? `${money(cents)} is too low: the ticket wouldn't make money.`
    : `${money(cents)} is too low: the ticket would stop making money. The lowest ${what} can go is ${money(lowest)}.`
}

/**
 * The ticket: one row per item, then delivery, then financing, discounts on the
 * whole ticket, the reasons for them, and the totals with tax.
 */
export function Ticket({
  deal,
  ev,
  ctx,
  products,
  reasons,
  iteration,
  dispatch,
}: {
  deal: Deal
  ev: Evaluation
  ctx: Ctx
  products: Product[]
  reasons: string[]
  /** The iteration being worked on (1 before any offer). */
  iteration: number
  dispatch: (a: DealAction) => void
}) {
  return (
    <section className="card ticket" aria-label="The ticket">
      <div className="ticket-head">
        <h2>Iteration {iteration}</h2>
        {iteration > 1 && <span className="small muted">Starts from iteration {iteration - 1}; change anything, then offer it.</span>}
      </div>
      <div className="trow thead" aria-hidden>
        <span>Item</span>
        <span>Size</span>
        <span>Condition</span>
        <span className="num">Price</span>
        <span className="num">Qty</span>
        <span className="num">Total</span>
        <span />
      </div>
      {ev.lines.length === 0 && (
        <p className="muted empty">Nothing on the ticket yet. Type a SKU or a name above, use Look up, or load the sample deal.</p>
      )}
      <ul className="tlines">
        {ev.lines.map((row) => (
          <ItemRow
            key={row.lineId}
            row={row}
            line={deal.lines.find((l) => l.id === row.lineId)!}
            deal={deal}
            ev={ev}
            ctx={ctx}
            sizes={products.filter((p) => p.modelSku === row.product.modelSku)}
            dispatch={dispatch}
          />
        ))}
        <DeliveryRow deal={deal} ev={ev} ctx={ctx} dispatch={dispatch} />
      </ul>
      {ev.issues
        .filter((i) => !i.lineId && i.code !== 'below-floor')
        .map((i) => (
          <p key={i.code} className={`issue ${i.level}`}>{i.message}</p>
        ))}
      <TicketFoot deal={deal} ev={ev} ctx={ctx} reasons={reasons} dispatch={dispatch} />
    </section>
  )
}

function ItemRow({
  row,
  line,
  deal,
  ev,
  ctx,
  sizes,
  dispatch,
}: {
  row: LineResult
  line: Deal['lines'][number]
  deal: Deal
  ev: Evaluation
  ctx: Ctx
  sizes: Product[]
  dispatch: (a: DealAction) => void
}) {
  const [editing, setEditing] = useState<'dollars' | 'pct' | null>(null)
  const [note, setNote] = useNote(ev.toplineCents)
  const p = row.product
  const conditions = (['new', 'outlet'] as Condition[]).filter((c) => priceCost(p, c))
  const issues = ev.issues.filter((i) => i.lineId === row.lineId)
  const name = `${p.brand} ${p.model}`
  const off = row.discountCents

  /** Sets the line's total, unless that's above its price or too low for the ticket to make money. */
  const setTotal = (cents: number) => {
    setEditing(null)
    if (cents > row.listCents) {
      setNote(`${money(cents)} is above ${line.condition === 'outlet' ? 'its outlet price' : 'its price'} (${money(row.listCents)}).`)
      return
    }
    const next: Deal = { ...deal, lines: deal.lines.map((l) => (l.id === row.lineId ? { ...l, discountCents: row.listCents - cents } : l)) }
    if (cents < row.netCents && !sellable(evaluate(next, ctx))) {
      setNote(tooLow(cents, lowestLinePrice(deal, row.lineId, ctx), 'this item'))
      return
    }
    setNote(null)
    dispatch({ type: 'discount', lineId: row.lineId, discountCents: row.listCents - cents })
  }

  return (
    <li className={`trow${issues.some((i) => i.level === 'block') ? ' has-block' : ''}`}>
      <span className="t-item">
        <strong>{name}</strong>
        <span className="small muted code">
          {p.sku}
          {row.locked && <span className="lock">price-locked</span>}
        </span>
      </span>
      <span className="t-size">
        {sizes.length > 1 ? (
          <select aria-label={`Size of ${name}`} value={p.sku} onChange={(e) => dispatch({ type: 'size', lineId: row.lineId, sku: e.target.value })}>
            {sizes.map((s) => <option key={s.sku} value={s.sku}>{s.size}</option>)}
          </select>
        ) : (
          <span>{p.size}</span>
        )}
      </span>
      <span className="t-cond">
        {conditions.length > 1 ? (
          <select aria-label={`Condition of ${name}`} value={line.condition} onChange={(e) => dispatch({ type: 'condition', lineId: row.lineId, condition: e.target.value as Condition })}>
            {conditions.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
          </select>
        ) : (
          <span className="muted">{CONDITION_LABEL[line.condition]}</span>
        )}
      </span>
      <span className="t-price num" aria-label="Price each">{money(row.unitListCents)}</span>
      <span className="t-qty num">
        <span className="qty" role="group" aria-label={`Quantity of ${name}`}>
          <button type="button" aria-label="One fewer" disabled={line.qty <= 1} onClick={() => dispatch({ type: 'qty', lineId: row.lineId, qty: line.qty - 1 })}>−</button>
          <span aria-live="polite">{line.qty}</span>
          <button type="button" aria-label="One more" onClick={() => dispatch({ type: 'qty', lineId: row.lineId, qty: line.qty + 1 })}>+</button>
        </span>
      </span>
      <span className="t-total num">
        <MoneyInput label={`Total for ${name}`} cents={row.netCents} disabled={row.locked} onCommit={setTotal} />
        {off > 0 && <span className="small promo">−{pct(offBp(off, row.listCents))}</span>}
      </span>
      <span className="t-x">
        <button type="button" className="icon-btn" aria-label={`Remove ${name}`} onClick={() => dispatch({ type: 'remove', lineId: row.lineId })}>×</button>
      </span>
      {(!row.locked || line.condition === 'outlet' || issues.length > 0) && (
        <span className="t-notes small">
          {line.condition === 'outlet' && <span className="muted">Outlet (pre-owned): 20% off new, never more.</span>}
          {off > 0 && (
            <span>
              {row.netCents === 0 ? <span className="promo">Free: </span> : null}
              saves {money(off)} ({pct(offBp(off, row.listCents))})
            </span>
          )}
          {!row.locked && editing === null && (
            <span className="disc-btns">
              <button type="button" className="small-btn" onClick={() => setEditing('dollars')} aria-label={`Dollars off ${name}`}>$ off</button>
              <button type="button" className="small-btn" onClick={() => setEditing('pct')} aria-label={`Percent off ${name}`}>% off</button>
              {off > 0 && (
                <button type="button" className="small-btn" onClick={() => { setNote(null); dispatch({ type: 'discount', lineId: row.lineId, discountCents: 0 }) }}>
                  Remove discount
                </button>
              )}
            </span>
          )}
          {editing === 'dollars' && (
            <span className="disc-edit">
              <MoneyInput label={`Dollars off ${name}`} cents={Math.max(0, off)} onCommit={(c) => setTotal(row.listCents - c)} autoFocus />
              off
              <button type="button" className="link" onClick={() => setEditing(null)}>Cancel</button>
            </span>
          )}
          {editing === 'pct' && (
            <span className="disc-edit">
              <PctInput label={`Percent off ${name}`} bp={offBp(Math.max(0, off), row.listCents)} onCommit={(bp) => setTotal(row.listCents - applyBp(row.listCents, bp))} autoFocus />
              off
              <button type="button" className="link" onClick={() => setEditing(null)}>Cancel</button>
            </span>
          )}
          {note && <span className="issue warn" role="status">{note}</span>}
          {issues.map((i) => <span key={i.code} className={`issue ${i.level}`}>{i.message}</span>)}
        </span>
      )}
    </li>
  )
}

function DeliveryRow({ deal, ev, ctx, dispatch }: { deal: Deal; ev: Evaluation; ctx: Ctx; dispatch: (a: DealAction) => void }) {
  const [note, setNote] = useNote(ev.toplineCents)
  const { settings } = ctx
  const tier = deal.delivery ? settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId) : null
  const off = tier ? tier.priceCents - ev.deliveryPriceCents : 0

  const setPrice = (cents: number) => {
    if (!tier) return
    if (cents > tier.priceCents) {
      setNote(`${money(cents)} is above ${tier.label} delivery's price (${money(tier.priceCents)}).`)
      return
    }
    if (cents < tier.minPriceCents) {
      setNote(`${tier.label} delivery can't go below ${money(tier.minPriceCents)}.`)
      return
    }
    const next: Deal = { ...deal, delivery: { tierId: tier.id, priceCents: cents } }
    if (cents < ev.deliveryPriceCents && !sellable(evaluate(next, ctx))) {
      setNote(tooLow(cents, lowestLinePrice(deal, null, ctx), 'delivery'))
      return
    }
    setNote(null)
    dispatch({ type: 'delivery', delivery: { tierId: tier.id, priceCents: cents } })
  }

  return (
    <li className="trow delivery">
      <span className="t-item">
        <strong>Delivery</strong>
        <span className="dnote">
          {tier ? `Costs the store ${money(settings.deliveryCostCents)}, even when it's free` : 'Pickup: no delivery, no cost'}
        </span>
      </span>
      <span className="t-size t-wide">
        <select
          aria-label="Delivery"
          value={deal.delivery?.tierId ?? ''}
          onChange={(e) => {
            const t = settings.deliveryTiers.find((x) => x.id === e.target.value)
            setNote(null)
            dispatch({ type: 'delivery', delivery: t ? { tierId: t.id, priceCents: t.priceCents } : null })
          }}
        >
          <option value="">Pickup</option>
          {settings.deliveryTiers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </span>
      <span className="t-price num">{tier ? money(tier.priceCents) : '—'}</span>
      <span className="t-qty num">{tier ? 1 : ''}</span>
      <span className="t-total num">
        {deal.delivery && tier && tier.priceCents > 0 ? (
          <MoneyInput label="Delivery price" cents={deal.delivery.priceCents} onCommit={setPrice} />
        ) : (
          <span>{money(ev.deliveryPriceCents)}</span>
        )}
        {off > 0 && <span className="small promo">−{pct(offBp(off, tier!.priceCents))}</span>}
      </span>
      <span className="t-x" />
      {(off > 0 || note) && (
        <span className="t-notes small">
          {off > 0 && (
            <>
              <span>
                {ev.deliveryPriceCents === 0 ? <span className="promo">Free: </span> : null}
                saves {money(off)}
              </span>
              <button type="button" className="small-btn" onClick={() => { setNote(null); setPrice(tier!.priceCents) }}>Remove discount</button>
            </>
          )}
          {note && <span className="issue warn" role="status">{note}</span>}
        </span>
      )}
    </li>
  )
}

type WholeMode = 'total' | 'dollars' | 'pct'

/**
 * Discounts across the whole ticket: a new total, dollars off or percent off.
 * The cut is split across everything that can move (price-locked items stay at
 * list), the same share off each. Shows the lowest the ticket can go, and
 * refuses anything lower.
 */
function WholeTicket({ deal, ev, ctx, dispatch }: { deal: Deal; ev: Evaluation; ctx: Ctx; dispatch: (a: DealAction) => void }) {
  const [mode, setMode] = useState<WholeMode>('total')
  const [note, setNote] = useNote(ev.toplineCents)
  const lowest = useMemo(() => lowestTotal(deal, ctx), [deal, ctx])
  const locked = ev.lines.some((l) => l.locked)

  const priceAt = (target: number) => {
    if (target === ev.toplineCents && mode !== 'total') {
      setNote(`Nothing left to take off: everything that can move is already at $0${locked ? ' and price-locked items stay at list' : ''}.`)
      return
    }
    if (lowest !== null && target < lowest) {
      setNote(`${money(target)} is too low: under ${money(lowest)} the store loses money on this ticket.`)
      return
    }
    const priced = priceBundleAt(deal, target, 'spread', ctx)
    if (!priced.fits) {
      setNote(`${money(target)} is above the full price of everything on the ticket (${money(ev.listToplineCents)}).`)
      return
    }
    setNote(null)
    dispatch({ type: 'replace', deal: priced.deal })
  }

  if (ev.toplineCents <= 0 && ev.listToplineCents <= 0) return null
  return (
    <div className="whole">
      <span className="field-label" id="whole-label">Discount the whole ticket</span>
      <div className="whole-row">
        <div className="seg small-seg" role="group" aria-labelledby="whole-label">
          {(
            [
              ['total', 'New total'],
              ['dollars', '$ off'],
              ['pct', '% off'],
            ] as [WholeMode, string][]
          ).map(([m, label]) => (
            <button key={m} type="button" className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
        {mode === 'total' && <MoneyInput id="whole-total" label="New pre-tax total" cents={ev.toplineCents} onCommit={priceAt} />}
        {mode === 'dollars' && <MoneyInput label="Dollars off the whole ticket" cents={0} onCommit={(c) => c > 0 && priceAt(ev.toplineCents - c)} />}
        {mode === 'pct' && <PctInput label="Percent off the whole ticket" bp={0} onCommit={(bp) => bp > 0 && priceAt(toplineAfterPctOff(deal, bp, ctx))} />}
      </div>
      {lowest !== null && (
        <p className="small">
          Lowest you can go: <strong>{money(lowest)}</strong> pre-tax. Below that the store loses money.
        </p>
      )}
      <p className="small muted">
        The cut is split across everything that can move, the same share off each{locked ? '; price-locked items stay at list' : ''}.
        {mode !== 'total' ? ' It comes off the prices as they are now.' : ''}
      </p>
      {note && <p className="issue warn" role="status">{note}</p>}
    </div>
  )
}

function Reasons({ reasons, dispatch }: { reasons: string[]; dispatch: (a: DealAction) => void }) {
  return (
    <div className="reasons">
      <span className="field-label">Discount reasons</span>
      <div className="chips">
        {reasons.map((r, i) => (
          <span key={`${r}-${i}`} className="chip">
            {r}
            <button type="button" aria-label={`Remove ${r}`} onClick={() => dispatch({ type: 'remove-reason', index: i })}>×</button>
          </span>
        ))}
        <select
          aria-label="Add a discount reason"
          value=""
          onChange={(e) => e.target.value && dispatch({ type: 'add-reason', reason: e.target.value })}
        >
          <option value="">Add a reason…</option>
          {DISCOUNT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
    </div>
  )
}

function TicketFoot({
  deal,
  ev,
  ctx,
  reasons,
  dispatch,
}: {
  deal: Deal
  ev: Evaluation
  ctx: Ctx
  reasons: string[]
  dispatch: (a: DealAction) => void
}) {
  const { settings } = ctx
  return (
    <div className="tfoot">
      <div className="tfoot-left">
        <label className="inline">
          <span className="field-label">Financing</span>
          <select value={deal.financingMonths ?? ''} onChange={(e) => dispatch({ type: 'financing', months: e.target.value ? Number(e.target.value) : null })}>
            <option value="">None</option>
            {settings.financing.terms.map((m) => {
              const adj = ev.toplineCents > 0 ? financingAdjustment(settings, m, ev.toplineCents) : null
              const note = adj === null ? 'not offered at this amount' : adj > 0 ? `+${money(adj)} gross` : adj < 0 ? `−${money(-adj)} gross` : 'no change to gross'
              return (
                <option key={m} value={m} disabled={adj === null && deal.financingMonths !== m}>
                  {m} months ({note})
                </option>
              )
            })}
          </select>
        </label>
        {ev.lines.length > 0 && <WholeTicket deal={deal} ev={ev} ctx={ctx} dispatch={dispatch} />}
        {ev.lines.length > 0 && <Reasons reasons={reasons} dispatch={dispatch} />}
      </div>
      <dl className="tfoot-total">
        <div><dt>Total (pre-tax)</dt><dd className="mid">{money(ev.toplineCents)}</dd></div>
        <div><dt>Sales tax ({formatPct(settings.salesTaxBp, settings.salesTaxBp % 100 === 0 ? 0 : 2)})</dt><dd>{money(ev.taxCents)}</dd></div>
        <div className="with-tax"><dt>Total with tax</dt><dd>{money(ev.totalWithTaxCents)}</dd></div>
        {ev.savingsCents > 0 && <div><dt className="promo">Saves</dt><dd className="promo">{money(ev.savingsCents)} ({pct(offBp(ev.savingsCents, ev.listToplineCents))})</dd></div>}
      </dl>
    </div>
  )
}

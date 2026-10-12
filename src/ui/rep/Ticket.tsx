import { financingAdjustment, priceCost } from '../../engine'
import type { Condition, Ctx, Deal, Evaluation, LineResult, Product } from '../../engine'
import type { DealAction } from '../state'
import { MoneyInput, Signed } from '../bits'
import { money } from '../format'

const CONDITION_LABEL: Record<Condition, string> = { new: 'New', outlet: 'Outlet' }

/** The ticket: one row per item, then delivery, then financing, bundle deals and the total. */
export function Ticket({
  deal,
  ev,
  ctx,
  products,
  dispatch,
}: {
  deal: Deal
  ev: Evaluation
  ctx: Ctx
  products: Product[]
  dispatch: (a: DealAction) => void
}) {
  return (
    <section className="card ticket" aria-label="The ticket">
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
            ev={ev}
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
      <TicketFoot deal={deal} ev={ev} ctx={ctx} dispatch={dispatch} />
    </section>
  )
}

function ItemRow({
  row,
  line,
  ev,
  sizes,
  dispatch,
}: {
  row: LineResult
  line: Deal['lines'][number]
  ev: Evaluation
  sizes: Product[]
  dispatch: (a: DealAction) => void
}) {
  const p = row.product
  const conditions = (['new', 'outlet'] as Condition[]).filter((c) => priceCost(p, c))
  const issues = ev.issues.filter((i) => i.lineId === row.lineId)
  const listAfterPromo = row.listCents - row.promoCents
  const name = `${p.brand} ${p.model}`
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
        <MoneyInput
          label={`Total for ${name}`}
          cents={row.netCents}
          disabled={row.locked}
          onCommit={(cents) => dispatch({ type: 'discount', lineId: row.lineId, discountCents: listAfterPromo - cents })}
        />
        {(row.discountCents !== 0 || row.promoCents !== 0) && <s className="muted small">{money(row.listCents)}</s>}
      </span>
      <span className="t-x">
        <button type="button" className="icon-btn" aria-label={`Remove ${name}`} onClick={() => dispatch({ type: 'remove', lineId: row.lineId })}>×</button>
      </span>
      {(row.promoCents > 0 || row.discountCents > 0 || row.netCents === 0 || line.condition === 'outlet' || issues.length > 0) && (
        <span className="t-notes small">
          {line.condition === 'outlet' && <span className="muted">Outlet (pre-owned): 20% off new, never more.</span>}
          {row.promoCents > 0 && <span className="promo">Bundle deal −{money(row.promoCents)}</span>}
          {row.discountCents > 0 && row.netCents > 0 && <span className="muted">You took {money(row.discountCents)} off</span>}
          {row.netCents === 0 && <span className="promo">Free</span>}
          {issues.map((i) => <span key={i.code} className={`issue ${i.level}`}>{i.message}</span>)}
        </span>
      )}
    </li>
  )
}

function DeliveryRow({ deal, ev, ctx, dispatch }: { deal: Deal; ev: Evaluation; ctx: Ctx; dispatch: (a: DealAction) => void }) {
  const { settings } = ctx
  const tier = deal.delivery ? settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId) : null
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
          <MoneyInput label="Delivery price" cents={deal.delivery.priceCents} onCommit={(cents) => dispatch({ type: 'delivery', delivery: { tierId: tier.id, priceCents: cents } })} />
        ) : (
          <span>{money(ev.deliveryPriceCents)}</span>
        )}
        {tier && ev.deliveryPriceCents < tier.priceCents && <s className="muted small">{money(tier.priceCents)}</s>}
      </span>
      <span className="t-x" />
    </li>
  )
}

function TicketFoot({ deal, ev, ctx, dispatch }: { deal: Deal; ev: Evaluation; ctx: Ctx; dispatch: (a: DealAction) => void }) {
  const { settings } = ctx
  const dealsOn = deal.bundleDealIds.length
  return (
    <div className="tfoot">
      <div className="tfoot-left">
        <label className="inline">
          <span className="field-label">Financing</span>
          <select value={deal.financingMonths ?? ''} onChange={(e) => dispatch({ type: 'financing', months: e.target.value ? Number(e.target.value) : null })}>
            <option value="">None</option>
            {settings.financing.terms.map((m) => {
              const adj = ev.toplineCents > 0 ? financingAdjustment(settings, m, ev.toplineCents) : null
              const note = adj === null ? 'not offered at this amount' : adj > 0 ? `+${money(adj)} gross` : adj < 0 ? `−${money(-adj)} gross` : 'no change'
              return (
                <option key={m} value={m} disabled={adj === null && deal.financingMonths !== m}>
                  {m} months ({note})
                </option>
              )
            })}
          </select>
          {deal.financingMonths !== null && ev.financingAdjCents !== 0 && <span className="small">Gross <Signed cents={ev.financingAdjCents} /></span>}
        </label>
        {settings.bundleDeals.length > 0 && (
          <details className="deals">
            <summary>Bundle deals{dealsOn ? ` (${dealsOn} on)` : ''}</summary>
            {settings.bundleDeals.map((b) => {
              const on = deal.bundleDealIds.includes(b.id)
              const saved = on ? ev.lines.filter((l) => l.product.category === b.category).reduce((s, l) => s + l.promoCents, 0) : 0
              return (
                <label key={b.id} className="check">
                  <input type="checkbox" checked={on} onChange={(e) => dispatch({ type: 'bundle-deal', id: b.id, on: e.target.checked })} />
                  <span>
                    {b.label}
                    {on && (saved > 0 ? <span className="promo"> (−{money(saved)})</span> : <span className="muted"> (nothing on the ticket qualifies)</span>)}
                  </span>
                </label>
              )
            })}
          </details>
        )}
      </div>
      <div className="tfoot-total">
        <span className="label">Total (pre-tax)</span>
        <span className="mid">{money(ev.toplineCents)}</span>
        {ev.savingsCents > 0 && <span className="small promo">saves {money(ev.savingsCents)}</span>}
      </div>
    </div>
  )
}

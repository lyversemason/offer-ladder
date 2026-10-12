import { useMemo, useState } from 'react'
import { financingAdjustment, isLocked, priceCost } from '../../engine'
import type { Category, Condition, Ctx, Deal, Evaluation, LineResult } from '../../engine'
import { CATALOG, CATEGORY_LABELS, productName } from '../../data/catalog'
import type { DealAction } from '../state'
import { MoneyInput, Signed } from '../bits'
import { money } from '../format'

const CONDITION_LABEL: Record<Condition, string> = { new: 'New', floor: 'Floor model', clearance: 'Clearance' }
const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[]

export function CatalogPicker({ ctx, dispatch }: { ctx: Ctx; dispatch: (a: DealAction) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length && !category) return []
    return CATALOG.filter((p) => {
      if (category && p.category !== category) return false
      const hay = `${p.brand} ${p.model} ${p.size ?? ''} ${p.sku}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    }).slice(0, 30)
  }, [query, category])

  return (
    <section className="card picker" aria-label="Add products">
      <label className="field-label" htmlFor="search">Add a product</label>
      <input
        id="search"
        className="search"
        type="search"
        placeholder="Search: brand, model or size (e.g. larkspur queen)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chips" role="group" aria-label="Category">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip${category === c ? ' on' : ''}`}
            aria-pressed={category === c}
            onClick={() => setCategory(category === c ? null : c)}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      {results.length > 0 && (
        <ul className="results">
          {results.map((p) => (
            <li key={p.sku}>
              <button type="button" className="result" onClick={() => dispatch({ type: 'add', sku: p.sku })}>
                <span className="result-name">
                  {productName(p)}
                  {isLocked(p, ctx.settings) && <span className="lock" title="Price-locked">locked</span>}
                  {p.floor && <span className="tag">floor model</span>}
                  {p.clearance && <span className="tag">clearance</span>}
                </span>
                <span className="result-price">{money(p.listCents)}</span>
                <span className="add" aria-hidden>+</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(query || category) && results.length === 0 && <p className="muted">Nothing matches. Try fewer words.</p>}
    </section>
  )
}

function LineCard({ row, line, ev, dispatch }: { row: LineResult; line: Deal['lines'][number]; ev: Evaluation; dispatch: (a: DealAction) => void }) {
  const p = row.product
  const conditions = (['new', 'floor', 'clearance'] as Condition[]).filter((c) => priceCost(p, c))
  const issues = ev.issues.filter((i) => i.lineId === row.lineId)
  const listAfterPromo = row.listCents - row.promoCents
  return (
    <li className={`line${issues.some((i) => i.level === 'block') ? ' has-block' : ''}`}>
      <div className="line-head">
        <div className="line-name">
          <strong>{productName(p)}</strong>
          {row.locked && <span className="lock">price-locked</span>}
        </div>
        <button type="button" className="icon-btn" aria-label={`Remove ${productName(p)}`} onClick={() => dispatch({ type: 'remove', lineId: row.lineId })}>
          ×
        </button>
      </div>
      <div className="line-controls">
        {conditions.length > 1 ? (
          <select
            aria-label="Condition"
            value={line.condition}
            onChange={(e) => dispatch({ type: 'condition', lineId: row.lineId, condition: e.target.value as Condition })}
          >
            {conditions.map((c) => (
              <option key={c} value={c}>{CONDITION_LABEL[c]}</option>
            ))}
          </select>
        ) : (
          <span className="muted small">{CONDITION_LABEL[line.condition]}</span>
        )}
        <div className="qty" role="group" aria-label="Quantity">
          <button type="button" aria-label="One fewer" disabled={line.qty <= 1} onClick={() => dispatch({ type: 'qty', lineId: row.lineId, qty: line.qty - 1 })}>−</button>
          <span aria-live="polite">{line.qty}</span>
          <button type="button" aria-label="One more" onClick={() => dispatch({ type: 'qty', lineId: row.lineId, qty: line.qty + 1 })}>+</button>
        </div>
        <div className="line-price">
          <MoneyInput
            label={`Price for ${productName(p)}`}
            cents={row.netCents}
            disabled={row.locked}
            onCommit={(cents) => dispatch({ type: 'discount', lineId: row.lineId, discountCents: listAfterPromo - cents })}
          />
          {(row.discountCents !== 0 || row.promoCents !== 0) && <s className="muted small">{money(row.listCents)}</s>}
        </div>
      </div>
      <div className="line-notes small">
        {line.qty > 1 && <span className="muted">{line.qty} × {money(row.unitListCents)} list</span>}
        {row.promoCents > 0 && <span className="promo">Bundle deal −{money(row.promoCents)}</span>}
        {row.discountCents > 0 && <span className="muted">You took {money(row.discountCents)} off</span>}
        {row.locked && <span className="muted">Sells at list price; find margin elsewhere.</span>}
      </div>
      {issues.map((i) => (
        <p key={i.code} className={`issue ${i.level}`}>{i.message}</p>
      ))}
    </li>
  )
}

export function DealLines({ deal, ev, ctx, dispatch }: { deal: Deal; ev: Evaluation; ctx: Ctx; dispatch: (a: DealAction) => void }) {
  const { settings } = ctx
  const deliveryTier = deal.delivery ? settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId) : null
  return (
    <section className="card" aria-label="The deal">
      <h2>The deal</h2>
      {ev.lines.length === 0 ? (
        <p className="muted">No products yet. Search above, or load the sample deal.</p>
      ) : (
        <ul className="lines">
          {ev.lines.map((row) => (
            <LineCard key={row.lineId} row={row} line={deal.lines.find((l) => l.id === row.lineId)!} ev={ev} dispatch={dispatch} />
          ))}
        </ul>
      )}
      {ev.issues
        .filter((i) => !i.lineId && i.code !== 'below-floor')
        .map((i) => (
          <p key={i.code} className={`issue ${i.level}`}>{i.message}</p>
        ))}

      <div className="extras">
        <div className="extra">
          <label className="field-label" htmlFor="delivery">Delivery</label>
          <div className="row">
            <select
              id="delivery"
              value={deal.delivery?.tierId ?? ''}
              onChange={(e) => {
                const t = settings.deliveryTiers.find((x) => x.id === e.target.value)
                dispatch({ type: 'delivery', delivery: t ? { tierId: t.id, priceCents: t.priceCents } : null })
              }}
            >
              <option value="">No delivery (takes it home)</option>
              {settings.deliveryTiers.map((t) => (
                <option key={t.id} value={t.id}>{t.label}: {money(t.priceCents)}</option>
              ))}
            </select>
            {deal.delivery && deliveryTier && deliveryTier.priceCents > 0 && (
              <MoneyInput
                label="Delivery price"
                cents={deal.delivery.priceCents}
                onCommit={(cents) => dispatch({ type: 'delivery', delivery: { tierId: deliveryTier.id, priceCents: cents } })}
              />
            )}
          </div>
          {deliveryTier && (
            <p className="small muted">
              Costs the store {money(settings.deliveryCostCents)}.{' '}
              {deliveryTier.minPriceCents < deliveryTier.priceCents && <>Lowest you can charge: {money(deliveryTier.minPriceCents)}.</>}
            </p>
          )}
        </div>

        <FinancingPicker deal={deal} ev={ev} ctx={ctx} dispatch={dispatch} />

        {settings.bundleDeals.length > 0 && (
          <fieldset className="extra">
            <legend className="field-label">Bundle deals</legend>
            {settings.bundleDeals.map((b) => {
              const on = deal.bundleDealIds.includes(b.id)
              const saved = on ? ev.lines.filter((l) => l.product.category === b.category).reduce((s, l) => s + l.promoCents, 0) : 0
              return (
                <label key={b.id} className="check">
                  <input type="checkbox" checked={on} onChange={(e) => dispatch({ type: 'bundle-deal', id: b.id, on: e.target.checked })} />
                  <span>
                    {b.label}
                    {on && (saved > 0 ? <span className="promo"> (−{money(saved)})</span> : <span className="muted"> (nothing in the deal qualifies)</span>)}
                  </span>
                </label>
              )
            })}
          </fieldset>
        )}
      </div>
    </section>
  )
}

function FinancingPicker({ deal, ev, ctx, dispatch }: { deal: Deal; ev: Evaluation; ctx: Ctx; dispatch: (a: DealAction) => void }) {
  const { settings } = ctx
  return (
    <div className="extra">
      <label className="field-label" htmlFor="financing">Financing</label>
      <select id="financing" value={deal.financingMonths ?? ''} onChange={(e) => dispatch({ type: 'financing', months: e.target.value ? Number(e.target.value) : null })}>
        <option value="">No financing</option>
        {settings.financing.terms.map((m) => {
          const adj = ev.toplineCents > 0 ? financingAdjustment(settings, m, ev.toplineCents) : null
          const note = adj === null ? 'not offered at this amount' : adj > 0 ? `adds ${money(adj)} to gross` : adj < 0 ? `takes ${money(-adj)} from gross` : 'no change to gross'
          return (
            <option key={m} value={m} disabled={adj === null && deal.financingMonths !== m}>
              {m} months ({note})
            </option>
          )
        })}
      </select>
      {deal.financingMonths !== null && ev.financingAdjCents !== 0 && (
        <p className="small">Financing changes gross by <Signed cents={ev.financingAdjCents} />.</p>
      )}
    </div>
  )
}

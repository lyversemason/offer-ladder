import { useMemo, useState } from 'react'
import { waysToTarget } from '../../engine'
import type { Ctx, Deal, Evaluation, Lever } from '../../engine'
import { CATALOG, productName } from '../../data/catalog'
import type { DealAction } from '../state'
import { Guide, TierBadge } from '../bits'
import { money } from '../format'

/** Where the discount sits in a priced deal, item by item. */
function Breakdown({ ev }: { ev: Evaluation }) {
  const parts: { label: string; cents: number }[] = []
  for (const l of ev.lines) {
    if (l.promoCents) parts.push({ label: `${productName(l.product)} (bundle deal)`, cents: l.promoCents })
    if (l.discountCents) parts.push({ label: productName(l.product), cents: l.discountCents })
  }
  if (ev.deliveryListCents > ev.deliveryPriceCents) parts.push({ label: 'Delivery', cents: ev.deliveryListCents - ev.deliveryPriceCents })
  if (!parts.length) return <p className="small muted">No discount needed.</p>
  return (
    <ul className="breakdown small">
      {parts.map((p) => (
        <li key={p.label}>
          <span>{p.label}</span>
          <span className="neg">−{money(p.cents)}</span>
        </li>
      ))}
    </ul>
  )
}

function leverText(l: Lever, ctx: Ctx): string {
  switch (l.kind) {
    case 'floor-model':
      return `Sell the floor model of ${productName(l.product)}: it costs the store less, so the bundle can go to ${money(l.toplineCents)} (${money(l.lowerByCents)} lower).`
    case 'financing': {
      return `${l.months}-month financing adds ${money(l.ev.financingAdjCents)} to gross, so the bundle can go to ${money(l.toplineCents)} (${money(l.lowerByCents)} lower).`
    }
    case 'add-on': {
      const price = money(l.product.listCents)
      return l.lowerByCents > 0
        ? `Add ${productName(l.product)} at full price (${price}): everything else can go ${money(l.lowerByCents)} lower and the deal still holds the tier.`
        : `Add ${productName(l.product)} at full price (${price}): it lifts the bundle into the ${ctx.settings.tiers.find((t) => t.id === l.ev.tier?.id)?.label.toLowerCase()} tier.`
    }
  }
}

export function TargetView({ deal, ctx, dispatch, guide, onUse }: { deal: Deal; ctx: Ctx; dispatch: (a: DealAction) => void; guide: boolean; onUse: () => void }) {
  const [tierId, setTierId] = useState(ctx.settings.tiers[1]?.id ?? ctx.settings.tiers[0].id)
  const valid = ctx.settings.tiers.some((t) => t.id === tierId) ? tierId : ctx.settings.tiers[0].id
  const result = useMemo(() => (deal.lines.length ? waysToTarget(deal, valid, ctx, CATALOG) : null), [deal, valid, ctx])
  const use = (d: Deal) => {
    dispatch({ type: 'replace', deal: d })
    onUse()
  }

  return (
    <section className="card" aria-label="Target a tier">
      <h2>Sell all of this and stay in…</h2>
      <div className="seg" role="group" aria-label="Tier">
        {ctx.settings.tiers.map((t) => (
          <button key={t.id} type="button" className={valid === t.id ? 'on' : ''} aria-pressed={valid === t.id} onClick={() => setTierId(t.id)}>
            {t.label} tier
          </button>
        ))}
      </div>
      <Guide on={guide}>
        Pick a tier and the app finds the lowest price that keeps it. Every way that only moves prices lands on the
        same number; what changes is where the discount sits, which changes how the customer hears it. The levers
        below change cost or gross dollars, so they really do go lower.
      </Guide>
      {!result ? (
        <p className="muted">Add products to the deal first.</p>
      ) : (
        <>
          {result.reachable ? (
            <p className="lead">
              Lowest price that keeps the {result.tier.label.toLowerCase()} tier: <strong>{money(result.lowestToplineCents!)}</strong>
            </p>
          ) : (
            <p className="note">
              Even at the asking price this bundle is below the {result.tier.label.toLowerCase()} tier, so no discount gets there.
              {result.levers.length ? ' These changes would:' : ''}
            </p>
          )}
          <div className="ways">
            {result.ways.map((w) => (
              <article key={w.id} className="way">
                <h3>{w.title}</h3>
                <p className="small muted">{w.how}</p>
                <Breakdown ev={w.ev} />
                <div className="way-foot">
                  <span>{money(w.ev.toplineCents)}</span>
                  <TierBadge tier={w.ev.tier} />
                  <span>you earn {money(w.ev.commissionCents)}</span>
                </div>
                <button type="button" className="small-btn" onClick={() => use(w.deal)}>Use this</button>
              </article>
            ))}
          </div>
          {result.levers.length > 0 && (
            <>
              <h3>Levers that go lower</h3>
              <ul className="levers">
                {result.levers.map((l, i) => (
                  <li key={i}>
                    <p>{leverText(l, ctx)}</p>
                    <div className="way-foot small">
                      <TierBadge tier={l.ev.tier} />
                      <span>you earn {money(l.ev.commissionCents)}</span>
                      <button type="button" className="small-btn" onClick={() => use(l.deal)}>Use this</button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}

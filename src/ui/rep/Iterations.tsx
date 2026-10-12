import { offBp } from '../../engine'
import type { Settings } from '../../engine'
import type { OfferMade } from '../state'
import { money, pct, tierClass } from '../format'

/**
 * The offers already made to this customer, oldest first. Each is the whole
 * ticket frozen at the moment it was offered: closed by default, opens to show
 * every line, and can't be changed. The rep always works in the next one.
 */
export function Iterations({ offers, settings }: { offers: OfferMade[]; settings: Settings }) {
  if (offers.length === 0) return null
  return (
    <section className="iterations" aria-label="Offers made to this customer">
      {offers.map((o, i) => {
        const tier = o.tierId ? settings.tiers.find((t) => t.id === o.tierId) : null
        return (
          <details key={i} className="card iteration">
            <summary>
              <strong>Iteration {i + 1}</strong>
              <span className="it-price">{money(o.toplineCents)}</span>
              <span className="small muted">{money(o.totalWithTaxCents)} with tax</span>
              {tier ? <span className={`tier tier-${tierClass(tier.id)}`}>{tier.label} tier</span> : <span className="tier tier-below">Below floor</span>}
              <span className="small">you earn {money(o.commissionCents)}</span>
            </summary>
            <table className="grid data it-table">
              <thead>
                <tr><th>Item</th><th>Size</th><th className="num">Qty</th><th className="num">Full price</th><th className="num">Offered</th><th className="num">Off</th></tr>
              </thead>
              <tbody>
                {o.lines.map((l, j) => (
                  <tr key={j}>
                    <td>{l.name}{l.condition === 'outlet' ? ' (outlet)' : ''} <span className="muted small code">{l.sku}</span></td>
                    <td>{l.size ?? ''}</td>
                    <td className="num">{l.qty}</td>
                    <td className="num">{money(l.listCents)}</td>
                    <td className="num">{money(l.netCents)}</td>
                    <td className="num">{l.listCents > l.netCents ? pct(offBp(l.listCents - l.netCents, l.listCents)) : ''}</td>
                  </tr>
                ))}
                <tr>
                  <td>Delivery{o.delivery ? `: ${o.delivery.label}` : ''}</td>
                  <td colSpan={2}>{o.delivery ? '' : 'Pickup'}</td>
                  <td className="num">{o.delivery ? money(o.delivery.listCents) : ''}</td>
                  <td className="num">{o.delivery ? money(o.delivery.priceCents) : ''}</td>
                  <td className="num">{o.delivery && o.delivery.listCents > o.delivery.priceCents ? pct(offBp(o.delivery.listCents - o.delivery.priceCents, o.delivery.listCents)) : ''}</td>
                </tr>
              </tbody>
            </table>
            <p className="small">
              {o.financingMonths ? `${o.financingMonths}-month financing (${o.financingAdjCents >= 0 ? '+' : '−'}${money(Math.abs(o.financingAdjCents))} gross)` : 'No financing'}
              {' · '}Saves {money(o.savingsCents)} · {pct(o.marginBp)} margin
              {o.reasons.length > 0 && <> · Reasons: {o.reasons.join(', ')}</>}
            </p>
          </details>
        )
      })}
    </section>
  )
}

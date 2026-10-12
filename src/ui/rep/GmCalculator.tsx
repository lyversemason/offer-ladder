import { gmAnalysis } from '../../engine'
import type { Ctx, Deal, Evaluation } from '../../engine'
import { productName } from '../../data/catalog'
import { Guide, Signed, TierBadge } from '../bits'
import { money, pct } from '../format'

/**
 * The margin screen: every line with its selling price, cost, gross and margin,
 * then the ticket totals, then how the totals become the commission.
 */
export function GmCalculator({ deal, ev, ctx, guide }: { deal: Deal; ev: Evaluation; ctx: Ctx; guide: boolean }) {
  const gm = gmAnalysis(ev)
  const tier = deal.delivery ? ctx.settings.deliveryTiers.find((t) => t.id === deal.delivery!.tierId) : null
  if (ev.lines.length === 0) {
    return (
      <section className="card">
        <h2>GM calculator</h2>
        <p className="muted">Put something on the ticket first.</p>
      </section>
    )
  }
  return (
    <section className="card gm" aria-label="GM calculator">
      <Guide on={guide}>
        The margin screen from the point of sale: each line's selling price, what it costs the store, and the gross
        dollars and margin it adds. Delivery is a line too, and it always costs the store, even when it's free. A line
        can lose money (a free pillow); only the whole ticket has to make money.
      </Guide>
      <h2>GM calculator</h2>
      <div className="table-scroll">
        <table className="grid data gm-table">
          <thead>
            <tr><th>Line</th><th className="num">Selling price</th><th className="num">Cost</th><th className="num">Gross $</th><th className="num">Margin</th></tr>
          </thead>
          <tbody>
            {gm.rows.map((r, i) => {
              const line = r.lineId ? ev.lines.find((l) => l.lineId === r.lineId) : undefined
              const label =
                r.kind === 'item' && line
                  ? `${productName(line.product)}${line.qty > 1 ? ` × ${line.qty}` : ''}${line.condition === 'outlet' ? ', outlet' : ''}`
                  : r.kind === 'delivery'
                    ? `Delivery: ${tier?.label ?? ''}`
                    : `Financing: ${deal.financingMonths} months`
              return (
                <tr key={r.lineId ?? `${r.kind}-${i}`} className={r.grossCents < 0 ? 'loss' : ''}>
                  <td>{label}</td>
                  <td className="num">{r.kind === 'financing' ? '' : money(r.sellingCents)}</td>
                  <td className="num">{r.kind === 'financing' ? '' : money(r.costCents)}</td>
                  <td className="num"><Signed cents={r.grossCents} /></td>
                  <td className="num">{r.marginBp === null ? '—' : pct(r.marginBp)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>Ticket</th>
              <th className="num">{money(gm.totals.sellingCents)}</th>
              <th className="num">{money(gm.totals.costCents)}</th>
              <th className="num">{money(gm.totals.grossCents)}</th>
              <th className="num">{pct(gm.totals.marginBp)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="gm-sum">
        <TierBadge tier={ev.tier} />
        {ev.tier ? (
          <p>
            {pct(ev.marginBp)} margin is the {ev.tier.label.toLowerCase()} tier: {pct(ev.tier.rateBp)}
            {ev.attach && ctx.settings.attach.bonusBp > 0 ? <> + {pct(ctx.settings.attach.bonusBp)} for the adjustable base = {pct(ev.rateBp)}</> : null} of{' '}
            {money(ev.grossCents)} gross is <strong>{money(ev.commissionCents)}</strong> commission.
          </p>
        ) : (
          <p className="issue block">{ev.issues.find((i) => i.code === 'below-floor')?.message ?? 'This ticket can’t be sold as it is.'}</p>
        )}
      </div>
    </section>
  )
}

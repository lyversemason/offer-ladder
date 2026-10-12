import { useMemo, useState } from 'react'
import { buildLadder } from '../../engine'
import type { Ctx, Deal, Strategy } from '../../engine'
import type { DealAction } from '../state'
import { Guide, TierBadge } from '../bits'
import { money, pct } from '../format'

const STRATEGY_LABEL: Record<Strategy, string> = {
  spread: 'A little off everything',
  'main-item': 'Mattress first',
  'delivery-first': 'Delivery first, then mattress',
}

export function LadderView({ deal, ctx, dispatch, guide, onUse }: { deal: Deal; ctx: Ctx; dispatch: (a: DealAction) => void; guide: boolean; onUse: () => void }) {
  const [strategy, setStrategy] = useState<Strategy>('spread')
  const ladder = useMemo(() => buildLadder(deal, ctx, { strategy }), [deal, ctx, strategy])
  const { rungs, notes, bestValueStep } = ladder

  if (rungs.length === 0) {
    return (
      <section className="card">
        <h2>Offer ladder</h2>
        <p className="muted">Add products to the deal first.</p>
      </section>
    )
  }

  return (
    <section className="card" aria-label="Offer ladder">
      <div className="card-head">
        <h2>Offer ladder</h2>
        <label className="small">
          Discount goes to{' '}
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
            {(Object.keys(STRATEGY_LABEL) as Strategy[]).map((s) => (
              <option key={s} value={s}>{STRATEGY_LABEL[s]}</option>
            ))}
          </select>
        </label>
      </div>
      <Guide on={guide}>
        The offers a rep would make, in order. One offer keeps the top tier; the next real discount drops into the
        wide middle tier, where another full step costs the rep only a little more; the floor is the final offer.
        Every step is at least the minimum step ({money(ctx.settings.minStep.cents)} or {pct(ctx.settings.minStep.pctBp)}),
        so no offer is a lowball.
      </Guide>
      {notes.map((n) => (
        <p key={n} className="note">{n}</p>
      ))}
      {bestValueStep && (
        <p className="callout">
          <strong>{rungs[bestValueStep.rungIndex].label}</strong> saves the customer another{' '}
          <strong>{money(bestValueStep.savesCents)}</strong> and costs you only <strong>{money(bestValueStep.costsCents)}</strong> of commission.
        </p>
      )}
      <ol className="ladder">
        {rungs.map((r, i) => (
          <li key={i} className={`rung${i === bestValueStep?.rungIndex ? ' best' : ''}`}>
            <div className="rung-head">
              <strong>{r.label}</strong>
              <TierBadge tier={r.ev.tier} />
            </div>
            <div className="rung-body">
              <div>
                <div className="label">Customer pays</div>
                <div className="mid">{money(r.ev.toplineCents)}</div>
                {r.kind !== 'asking' && <div className="small muted">{money(r.stepCents)} lower · saves {money(r.ev.savingsCents)} total</div>}
              </div>
              <div>
                <div className="label">You earn</div>
                <div className="mid">{money(r.ev.commissionCents)}</div>
                {r.kind !== 'asking' && <div className="small neg">{r.commissionChangeCents === 0 ? 'no change' : `−${money(-r.commissionChangeCents)}`}</div>}
              </div>
              <div>
                <div className="label">Margin</div>
                <div className="mid">{pct(r.ev.marginBp)}</div>
              </div>
            </div>
            {r.kind !== 'asking' && (
              <button
                type="button"
                className="small-btn"
                onClick={() => {
                  dispatch({ type: 'replace', deal: r.deal })
                  onUse()
                }}
              >
                Use this price
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

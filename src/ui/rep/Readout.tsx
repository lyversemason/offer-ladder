import { useMemo } from 'react'
import { tierRoom } from '../../engine'
import type { Ctx, Deal, Evaluation } from '../../engine'
import { snapshot } from '../state'
import type { DealAction, DiscountVia, OfferMade } from '../state'
import { useTrack } from '../usage'
import { Signed, TierBadge } from '../bits'
import { money, pct, tierColorClass } from '../format'

export function Readout({
  deal,
  ev,
  ctx,
  reasons,
  offers,
  lineVia,
  dispatch,
  onRecord,
}: {
  deal: Deal
  ev: Evaluation
  ctx: Ctx
  reasons: string[]
  offers: OfferMade[]
  lineVia: Record<string, DiscountVia>
  dispatch: (a: DealAction) => void
  onRecord?: () => void
}) {
  const track = useTrack()
  const room = useMemo(() => tierRoom(deal, ctx), [deal, ctx])
  const empty = ev.toplineCents <= 0
  const belowFloor = ev.issues.find((i) => i.code === 'below-floor')

  return (
    <section className={`card readout tone-${tierColorClass(ev)}`} aria-label="Live numbers">
      <div className="readout-top">
        <div>
          <div className="label">Customer pays</div>
          <div className="big">{money(ev.toplineCents)}</div>
          {!empty && <div className="small">{money(ev.totalWithTaxCents)} with tax</div>}
          {ev.savingsCents > 0 && (
            <div className="small">
              <s className="muted">{money(ev.listToplineCents)}</s> · saves {money(ev.savingsCents)}
            </div>
          )}
        </div>
        <div className="readout-right">
          <TierBadge tier={ev.tier} empty={empty} />
          <div className="label">Your commission</div>
          <div className="big">{money(ev.commissionCents)}</div>
          {ev.tier && (
            <div className="small muted">
              {ev.attach && ctx.settings.attach.bonusBp > 0
                ? `${pct(ev.tier.rateBp)} + ${pct(ctx.settings.attach.bonusBp)} base bonus = ${pct(ev.rateBp)} of gross $`
                : `${pct(ev.rateBp)} of gross $`}
            </div>
          )}
        </div>
      </div>

      {!empty && (
        <>
          <dl className="numbers">
            <div><dt>Margin</dt><dd>{pct(ev.marginBp)}</dd></div>
            <div><dt>Gross $</dt><dd>{money(ev.grossCents)}</dd></div>
            <div><dt>Product cost</dt><dd>{money(ev.productCostCents)}</dd></div>
            {ev.financingAdjCents !== 0 && <div><dt>Financing gross</dt><dd><Signed cents={ev.financingAdjCents} /></dd></div>}
          </dl>

          <div className="room">
            {belowFloor ? (
              <p className="issue block">{belowFloor.message}</p>
            ) : (
              ev.tier && (
                <p>
                  {room.canGoLowerCents > 0 ? (
                    <>You can go <strong>{money(room.canGoLowerCents)}</strong> lower and stay in the {ev.tier.label.toLowerCase()} tier.</>
                  ) : (
                    <>This is the bottom of the {ev.tier.label.toLowerCase()} tier.</>
                  )}
                </p>
              )
            )}
            {room.nextUp && (
              <p className="muted">
                At {money(room.nextUp.toplineCents)} (+{money(room.nextUp.raiseCents)}) it's back in the {room.nextUp.label.toLowerCase()} tier.
              </p>
            )}
          </div>

          <div className="say">
            <button
              type="button"
              className="primary"
              onClick={() => {
                track('offer_recorded', { value: offers.length + 1 })
                dispatch({ type: 'offer', offer: snapshot(deal, ev, ctx.settings, reasons, lineVia) })
              }}
              disabled={!ev.ok}
            >
              I offered this price
            </button>
            {onRecord && <button type="button" onClick={onRecord}>Record the outcome…</button>}
          </div>
          <p className="small muted">
            Saves this ticket as iteration {offers.length + 1}{offers.length ? ' (the earlier ones are above the ticket)' : ''}. You keep working in the next one.
          </p>
        </>
      )}
    </section>
  )
}

/** The slim bar pinned to the bottom of a phone screen. */
export function MiniReadout({ ev }: { ev: Evaluation }) {
  if (ev.toplineCents <= 0) return null
  return (
    <div className={`mini-readout tone-${tierColorClass(ev)}`} aria-hidden>
      <span>{money(ev.toplineCents)}</span>
      <TierBadge tier={ev.tier} />
      <span>{money(ev.commissionCents)}</span>
    </div>
  )
}

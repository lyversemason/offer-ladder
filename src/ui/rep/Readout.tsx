import { useMemo, useState } from 'react'
import { checkStep, priceBundleAt, tierRoom } from '../../engine'
import type { Ctx, Deal, Evaluation } from '../../engine'
import type { DealAction, OfferMade } from '../state'
import { MoneyInput, Signed, TierBadge } from '../bits'
import { money, pct, tierColorClass } from '../format'

export function Readout({
  deal,
  ev,
  ctx,
  offers,
  dispatch,
  onRecord,
}: {
  deal: Deal
  ev: Evaluation
  ctx: Ctx
  offers: OfferMade[]
  dispatch: (a: DealAction) => void
  onRecord?: () => void
}) {
  const room = useMemo(() => tierRoom(deal, ctx), [deal, ctx])
  const [stepWarning, setStepWarning] = useState<string | null>(null)
  // The note only shows while the deal is still at the price it was written for.
  const [bundleNote, setBundleNote] = useState<{ text: string; toplineCents: number } | null>(null)
  const empty = ev.toplineCents <= 0
  const lastOffer = offers[offers.length - 1]
  const belowFloor = ev.issues.find((i) => i.code === 'below-floor')

  const sayIt = () => {
    if (lastOffer) {
      const w = checkStep(lastOffer.toplineCents, ev.toplineCents, ctx.settings)
      if (w && stepWarning !== w.message) {
        setStepWarning(w.message)
        return
      }
    }
    setStepWarning(null)
    dispatch({ type: 'offer', offer: { toplineCents: ev.toplineCents, tierId: ev.tier?.id ?? null, commissionCents: ev.commissionCents } })
  }

  return (
    <section className={`card readout tone-${tierColorClass(ev)}`} aria-label="Live numbers">
      <div className="readout-top">
        <div>
          <div className="label">Customer pays</div>
          <div className="big">{money(ev.toplineCents)}</div>
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
            {ev.deliveryCostCents > 0 && <div><dt>Delivery cost</dt><dd>{money(ev.deliveryCostCents)}</dd></div>}
            {ev.financingAdjCents !== 0 && <div><dt>Financing</dt><dd><Signed cents={ev.financingAdjCents} /></dd></div>}
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

          <div className="bundle-price">
            <label className="field-label" htmlFor="bundle-price">Price the whole bundle</label>
            <div className="row">
              <MoneyInput
                id="bundle-price"
                label="Bundle price"
                cents={ev.toplineCents}
                onCommit={(cents) => {
                  const priced = priceBundleAt(deal, cents, 'spread', ctx)
                  const locked = priced.ev.lines.some((l) => l.locked)
                  setBundleNote(
                    priced.fits
                      ? null
                      : {
                          text: `${money(cents)} isn't possible: every item that can move is at its cost${locked ? ', and price-locked items stay at list' : ''}. The lowest this bundle can go is ${money(priced.ev.toplineCents)}.`,
                          toplineCents: priced.ev.toplineCents,
                        },
                  )
                  dispatch({ type: 'replace', deal: priced.deal })
                }}
              />
              <span className="small muted">Type one number; the discount is shared across items that can move.</span>
            </div>
            {bundleNote && bundleNote.toplineCents === ev.toplineCents && <p className="issue warn">{bundleNote.text}</p>}
          </div>

          <div className="say">
            <button type="button" className="primary" onClick={sayIt} disabled={!ev.ok}>
              {stepWarning ? 'Offer it anyway' : 'I offered this price'}
            </button>
            {onRecord && offers.length > 0 && (
              <button type="button" onClick={onRecord}>Record the outcome…</button>
            )}
          </div>
          {stepWarning && <p className="issue warn">{stepWarning}</p>}
          {offers.length > 0 && (
            <ol className="offers-made" aria-label="Offers made to this customer">
              {offers.map((o, i) => (
                <li key={i}>
                  <span>{money(o.toplineCents)}</span>
                  <span className="muted small">{o.tierId ? ctx.settings.tiers.find((t) => t.id === o.tierId)?.label ?? o.tierId : 'below floor'} · you earn {money(o.commissionCents)}</span>
                </li>
              ))}
            </ol>
          )}
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

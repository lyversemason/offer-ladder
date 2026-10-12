import { useState } from 'react'
import { baseDeal, evaluate } from '../../engine'
import type { Ctx, Deal, Evaluation } from '../../engine'
import { recordVisit, recordWalkOffers, saveDeal } from '../../db/database'
import type { Database, OfferRecord } from '../../db/database'
import type { Rep } from '../../data/org'
import type { OfferMade } from '../state'
import { money } from '../format'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Saves how the conversation ended: a sale at the current price, or a customer
 * who walked. Either way it counts as an "up" and lands in the reports.
 */
export function RecordOutcome({
  db,
  rep,
  deal,
  ev,
  ctx,
  offers,
  onDone,
  onCancel,
}: {
  db: Database | null
  rep: Rep
  deal: Deal
  ev: Evaluation
  ctx: Ctx
  offers: OfferMade[]
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  if (!db) return <p className="note">The database is still loading…</p>

  // The asking price is always the first offer, then every price said out loud.
  const asking = evaluate(baseDeal(deal, ctx), ctx)
  const history: OfferRecord[] = [
    { toplineCents: asking.toplineCents, marginBp: asking.marginBp, tierId: asking.tier?.id ?? null, commissionCents: asking.commissionCents, accepted: false },
    ...offers
      .filter((o) => o.toplineCents !== asking.toplineCents)
      .map((o) => ({ toplineCents: o.toplineCents, marginBp: o.marginBp, tierId: o.tierId, commissionCents: o.commissionCents, accepted: false })),
  ]

  const sold = () => {
    const offerList = [...history]
    const last = offerList[offerList.length - 1]
    if (last.toplineCents === ev.toplineCents) last.accepted = true
    else offerList.push({ toplineCents: ev.toplineCents, marginBp: ev.marginBp, tierId: ev.tier?.id ?? null, commissionCents: ev.commissionCents, accepted: true })
    try {
      saveDeal(db, { repId: rep.id, storeId: rep.storeId, date: today(), deal, ev, offers: offerList })
      onDone(`Sale saved for ${rep.name}: ${money(ev.toplineCents)}, ${money(ev.commissionCents)} commission. It's in the reports now.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const walked = () => {
    const visitId = recordVisit(db, { repId: rep.id, storeId: rep.storeId, date: today(), sold: false })
    recordWalkOffers(db, visitId, history)
    onDone(`Saved: the customer walked after ${history.length} offer${history.length === 1 ? '' : 's'}. It counts as an up in ${rep.name}'s conversion.`)
  }

  return (
    <div className="outcome" role="group" aria-label="Record the outcome">
      <p><strong>How did it end?</strong></p>
      <div className="row">
        <button type="button" className="primary" disabled={!ev.ok} onClick={sold}>Sold at {money(ev.toplineCents)}</button>
        <button type="button" onClick={walked}>Customer walked</button>
        <button type="button" className="link" onClick={onCancel}>Cancel</button>
      </div>
      {!ev.ok && <p className="small muted">A blocked price can't be saved as a sale.</p>}
      {error && <p className="issue block">{error}</p>}
    </div>
  )
}

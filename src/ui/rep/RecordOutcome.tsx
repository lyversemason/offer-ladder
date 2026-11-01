import { useState } from 'react'
import { baseDeal, evaluate } from '../../engine'
import type { Ctx, Deal, Evaluation } from '../../engine'
import { recordVisit, recordWalkOffers, saveDeal } from '../../db/database'
import type { Database, OfferRecord } from '../../db/database'
import type { Rep } from '../../data/org'
import { snapshot } from '../state'
import type { DiscountVia, OfferMade } from '../state'
import { useTrack } from '../usage'
import { toOfferRecord } from '../offers'
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
  reasons,
  lineVia,
  ticketId,
  onDone,
  onCancel,
}: {
  db: Database | null
  rep: Rep
  deal: Deal
  ev: Evaluation
  ctx: Ctx
  offers: OfferMade[]
  reasons: string[]
  lineVia: Record<string, DiscountVia>
  ticketId: string
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const track = useTrack()
  const [error, setError] = useState<string | null>(null)
  if (!db) return <p className="note">The database is still loading…</p>

  // The asking price is always the first offer (everything at list, the ticket's
  // delivery and financing as they are), then every price said out loud.
  const base = baseDeal(deal, ctx)
  const asking = snapshot(base, evaluate(base, ctx), ctx.settings, [])
  const history: OfferRecord[] = [
    toOfferRecord(asking, false),
    ...offers.filter((o) => o.toplineCents !== asking.toplineCents).map((o) => toOfferRecord(o, false)),
  ]

  const sold = () => {
    const offerList = [...history]
    const last = offerList[offerList.length - 1]
    if (last.toplineCents === ev.toplineCents) last.accepted = true
    else offerList.push(toOfferRecord(snapshot(deal, ev, ctx.settings, reasons, lineVia), true))
    try {
      saveDeal(db, { repId: rep.id, storeId: rep.storeId, date: today(), deal, ev, offers: offerList, ticketId })
      track('outcome_recorded', { how: 'bought', value: offerList.length - 1 })
      onDone(`Sale saved for ${rep.name}: ${money(ev.toplineCents)}, ${money(ev.commissionCents)} commission. It's in the reports now.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const walked = () => {
    const visitId = recordVisit(db, { repId: rep.id, storeId: rep.storeId, date: today(), sold: false, ticketId })
    recordWalkOffers(db, visitId, history)
    track('outcome_recorded', { how: 'walked', value: history.length - 1 })
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

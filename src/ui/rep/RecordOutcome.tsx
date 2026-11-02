import { useState } from 'react'
import { baseDeal, evaluate } from '../../engine'
import type { Ctx, Deal, Evaluation } from '../../engine'
import type { OfferRecord } from '../../db/database'
import type { DataSource } from '../../source/types'
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
 * who walked. Either way it counts as an "up" and lands in the reports. The data
 * source prices a sale again before saving it; the message shows its numbers.
 */
export function RecordOutcome({
  source,
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
  source: DataSource | null
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
  const [saving, setSaving] = useState(false)
  if (!source) return <p className="note">The database is still loading…</p>

  // The asking price is always the first offer (everything at list, the ticket's
  // delivery and financing as they are), then every price said out loud.
  const base = baseDeal(deal, ctx)
  const asking = snapshot(base, evaluate(base, ctx), ctx.settings, [])
  const history: OfferRecord[] = [
    toOfferRecord(asking, false),
    ...offers.filter((o) => o.toplineCents !== asking.toplineCents).map((o) => toOfferRecord(o, false)),
  ]

  const save = async (offers: OfferRecord[], sale: Deal | null) => {
    setSaving(true)
    setError(null)
    try {
      const saved = await source.recordOutcome({ repId: rep.id, storeId: rep.storeId, date: today(), ticketId, offers, sale })
      track('outcome_recorded', { how: sale ? 'bought' : 'walked', value: saved.offers - 1 })
      onDone(
        saved.sale
          ? `Sale saved for ${rep.name}: ${money(saved.sale.toplineCents)}, ${money(saved.sale.commissionCents)} commission. It's in the reports now.`
          : `Saved: the customer walked after ${saved.offers} offer${saved.offers === 1 ? '' : 's'}. It counts as an up in ${rep.name}'s conversion.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const sold = () => {
    const offerList = history.map((o) => ({ ...o }))
    const last = offerList[offerList.length - 1]
    if (last.toplineCents === ev.toplineCents) last.accepted = true
    else offerList.push(toOfferRecord(snapshot(deal, ev, ctx.settings, reasons, lineVia), true))
    void save(offerList, deal)
  }

  const walked = () => void save(history, null)

  return (
    <div className="outcome" role="group" aria-label="Record the outcome">
      <p><strong>How did it end?</strong></p>
      <div className="row">
        <button type="button" className="primary" disabled={!ev.ok || saving} onClick={sold}>Sold at {money(ev.toplineCents)}</button>
        <button type="button" disabled={saving} onClick={walked}>Customer walked</button>
        <button type="button" className="link" onClick={onCancel}>Cancel</button>
      </div>
      {saving && <p className="small muted" role="status">Saving…</p>}
      {!ev.ok && <p className="small muted">A blocked price can't be saved as a sale.</p>}
      {error && <p className="issue block">{error}</p>}
    </div>
  )
}

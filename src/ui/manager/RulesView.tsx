import { useMemo, useState } from 'react'
import { evaluate, makeCatalog, validateSettings } from '../../engine'
import type { Category, Product, Settings } from '../../engine'
import { CATEGORY_LABELS, CATEGORY_SINGULAR } from '../../data/catalog'
import { DEFAULT_SETTINGS } from '../../data/settings'
import { Guide, MoneyInput, TierBadge } from '../bits'
import { money, pct } from '../format'
import { sampleDeal } from '../state'

/** A percent field stored as basis points (12.5% = 1250). Commits on Enter or leaving the field. */
function PctInput({ bp, onCommit, label }: { bp: number; onCommit: (bp: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft.replace('%', '').trim())
    if (!Number.isFinite(n) || draft.trim() === '') {
      setBad(true)
      return
    }
    setDraft(null)
    setBad(false)
    onCommit(Math.round(n * 100))
  }
  return (
    <span className="pct-input">
      <input
        aria-label={label}
        aria-invalid={bad}
        className={bad ? 'bad' : ''}
        inputMode="decimal"
        value={draft ?? String(bp / 100)}
        onFocus={(e) => {
          setDraft(String(bp / 100))
          e.target.select()
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          setBad(false)
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      %
    </span>
  )
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[]
const SAMPLE = sampleDeal()

export function RulesView({ settings, products, onSave, guide }: { settings: Settings; products: Product[]; onSave: (s: Settings) => void; guide: boolean }) {
  const brands = [...new Set(products.map((p) => p.brand))]
  // One entry per model (every size shares the model's SKU and its lock).
  const models = [...new Map(products.map((p) => [p.modelSku, p])).values()]
  const [draft, setDraft] = useState<Settings>(settings)
  const edit = (fn: (s: Settings) => void) =>
    setDraft((cur) => {
      const next = structuredClone(cur)
      fn(next)
      return next
    })
  const problems = useMemo(() => validateSettings(draft), [draft])
  const changed = JSON.stringify(draft) !== JSON.stringify(settings)

  // What the change does to one familiar deal, before anyone saves it.
  const catalog = useMemo(() => makeCatalog(products), [products])
  const before = useMemo(() => evaluate(SAMPLE, { catalog, settings }), [catalog, settings])
  const after = useMemo(() => (problems.length ? null : evaluate(SAMPLE, { catalog, settings: draft })), [catalog, draft, problems])

  const floor = draft.tiers[draft.tiers.length - 1]

  return (
    <div className="rules">
      <Guide on={guide}>
        You're the store manager. These rules drive every number the reps see: tiers and rates, the base bonus,
        the minimum offer step, delivery, bundle deals, the financing chart and which models are price-locked.
        Nothing changes until you save, and broken rules (like tiers out of order) can't be saved.
      </Guide>

      <section className="card">
        <h2>Commission tiers</h2>
        <p className="small muted">Commission is a percent of gross profit dollars. A deal earns the highest tier whose minimum margin it meets. The last tier's minimum is the margin floor ({pct(floor.minMarginBp)}): below it, a price needs manager approval.</p>
        <table className="grid">
          <thead>
            <tr><th>Tier</th><th>Minimum margin</th><th>Commission rate</th></tr>
          </thead>
          <tbody>
            {draft.tiers.map((t, i) => (
              <tr key={t.id}>
                <td><TierBadge tier={t} /></td>
                <td><PctInput label={`${t.label} minimum margin`} bp={t.minMarginBp} onCommit={(bp) => edit((s) => (s.tiers[i].minMarginBp = bp))} /></td>
                <td><PctInput label={`${t.label} rate`} bp={t.rateBp} onCommit={(bp) => edit((s) => (s.tiers[i].rateBp = bp))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-row">
          <label>
            Attach bonus for
            <select value={draft.attach.category} onChange={(e) => edit((s) => (s.attach.category = e.target.value as Category))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c].toLowerCase()}</option>)}
            </select>
          </label>
          <label>
            adds <PctInput label="Attach bonus" bp={draft.attach.bonusBp} onCommit={(bp) => edit((s) => (s.attach.bonusBp = bp))} /> to the rate
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Offers</h2>
        <div className="form-row">
          <label>
            Minimum step: at least
            <MoneyInput label="Minimum step dollars" cents={draft.minStep.cents} onCommit={(c) => edit((s) => (s.minStep.cents = c))} />
          </label>
          <label>
            or <PctInput label="Minimum step percent" bp={draft.minStep.pctBp} onCommit={(bp) => edit((s) => (s.minStep.pctBp = bp))} /> of the price, whichever is larger
          </label>
        </div>
        <div className="form-row">
          <label>
            Round offers up to the nearest
            <select value={draft.roundToCents} onChange={(e) => edit((s) => (s.roundToCents = Number(e.target.value)))}>
              {[100, 500, 1000, 2500, 5000].map((c) => <option key={c} value={c}>{money(c)}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Delivery</h2>
        <div className="form-row">
          <label>
            Each delivery costs the store
            <MoneyInput label="Delivery cost" cents={draft.deliveryCostCents} onCommit={(c) => edit((s) => (s.deliveryCostCents = c))} />
          </label>
        </div>
        <table className="grid">
          <thead><tr><th>Option</th><th>Price</th><th>Lowest a rep may charge</th></tr></thead>
          <tbody>
            {draft.deliveryTiers.map((t, i) => (
              <tr key={t.id}>
                <td>{t.label}</td>
                <td><MoneyInput label={`${t.label} price`} cents={t.priceCents} onCommit={(c) => edit((s) => (s.deliveryTiers[i].priceCents = c))} /></td>
                <td><MoneyInput label={`${t.label} lowest price`} cents={t.minPriceCents} onCommit={(c) => edit((s) => (s.deliveryTiers[i].minPriceCents = c))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Bundle deals</h2>
        <p className="small muted">Deals a rep can switch on for a customer. Turn one off and reps no longer see it.</p>
        {DEFAULT_SETTINGS.bundleDeals.map((d) => {
          const i = draft.bundleDeals.findIndex((x) => x.id === d.id)
          const current = i >= 0 ? draft.bundleDeals[i] : d
          return (
            <div key={d.id} className="form-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={i >= 0}
                  onChange={(e) =>
                    edit((s) => {
                      s.bundleDeals = e.target.checked ? [...s.bundleDeals, structuredClone(d)] : s.bundleDeals.filter((x) => x.id !== d.id)
                    })
                  }
                />
                {d.kind === 'nth-off'
                  ? `Every ${d.nth === 2 ? 'second' : `${d.nth}th`} ${CATEGORY_SINGULAR[d.category]}`
                  : `${CATEGORY_SINGULAR[d.category].replace(/^./, (c) => c.toUpperCase())} with a ${CATEGORY_SINGULAR[d.anchorCategory]}`}
              </label>
              {i >= 0 && (
                <label>
                  <PctInput label={`${d.label} discount`} bp={current.pctOffBp} onCommit={(bp) => edit((s) => (s.bundleDeals[i].pctOffBp = bp))} /> off
                </label>
              )}
            </div>
          )
        })}
      </section>

      <section className="card">
        <h2>Financing</h2>
        <p className="small muted">
          How each financing term changes the sale's gross dollars, by the amount financed. Positive adds to gross,
          negative takes away; leave a box empty when that term isn't offered at that amount.
        </p>
        <div className="table-scroll">
          <table className="grid fin">
            <thead>
              <tr>
                <th>Amount financed</th>
                {draft.financing.terms.map((m) => <th key={m}>{m} mo</th>)}
              </tr>
            </thead>
            <tbody>
              {draft.financing.bands.map((b, bi) => (
                <tr key={bi}>
                  <td>{money(b.minCents)}+</td>
                  {b.adjustments.map((a, ti) => (
                    <td key={ti} className={a === null ? 'off' : a > 0 ? 'pos-cell' : a < 0 ? 'neg-cell' : ''}>
                      <FinCell value={a} label={`${money(b.minCents)}+, ${draft.financing.terms[ti]} months`} onCommit={(v) => edit((s) => (s.financing.bands[bi].adjustments[ti] = v))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Price-locked</h2>
        <p className="small muted">Locked models always sell at list price, in every size. Reps have to find the margin in the rest of the bundle.</p>
        {brands.map((b) => (
          <fieldset key={b} className="lock-group">
            <legend className="field-label">{b}</legend>
            <div className="form-row wrap">
              {models.filter((m) => m.brand === b).map((m) => (
                <label key={m.modelSku} className="check">
                  <input type="checkbox" checked={draft.priceLock.models.includes(m.modelSku)} onChange={(e) => edit((s) => (s.priceLock.models = e.target.checked ? [...s.priceLock.models, m.modelSku] : s.priceLock.models.filter((x) => x !== m.modelSku)))} />
                  {m.model} <span className="muted small">({CATEGORY_SINGULAR[m.category]})</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {draft.pairing.map((r) => (
          <p key={r.brand} className="small">
            <strong>Pairing rule:</strong> a {r.brand} mattress only goes on a {r.supportBrands.join(' or ')} foundation or
            adjustable base (the maker's warranty rule). Any mattress can go on a {r.supportBrands.join(' or ')} one.
          </p>
        ))}
      </section>

      <section className="card save-bar" aria-live="polite">
        {problems.length > 0 ? (
          <ul className="problems">
            {problems.map((p) => <li key={p} className="issue block">{p}</li>)}
          </ul>
        ) : (
          changed &&
          after && (
            <p>
              On the sample deal at asking price ({money(after.toplineCents)}), the rep would earn{' '}
              <strong>{money(after.commissionCents)}</strong> instead of {money(before.commissionCents)} (
              {after.tier
                ? `${after.tier.label.toLowerCase()} tier, ${pct(after.tier.rateBp)}${after.attach && draft.attach.bonusBp ? ` + ${pct(draft.attach.bonusBp)} base bonus` : ''}`
                : 'below the floor'}
              ).
            </p>
          )
        )}
        <div className="row">
          <button type="button" className="primary" disabled={!changed || problems.length > 0} onClick={() => onSave(draft)}>Save rules</button>
          <button type="button" disabled={!changed} onClick={() => setDraft(settings)}>Undo changes</button>
          <button type="button" className="link" onClick={() => setDraft(structuredClone(DEFAULT_SETTINGS))}>Start from the demo rules</button>
        </div>
      </section>
    </div>
  )
}

function FinCell({ value, onCommit, label }: { value: number | null; onCommit: (v: number | null) => void; label: string }) {
  const show = (v: number | null) => (v === null ? '' : String(v / 100))
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const t = draft.replace(/[$,\s+]/g, '')
    setDraft(null)
    if (t === '') return onCommit(null)
    const n = Number(t)
    if (Number.isFinite(n)) onCommit(Math.round(n * 100))
  }
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      placeholder="—"
      value={draft ?? show(value)}
      onFocus={() => setDraft(show(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

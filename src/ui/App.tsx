import { useState } from 'react'
import { COMPANY, REPS, STORES } from '../data/org'
import { Guide } from './bits'
import { sampleDeal, useDeal, useEvaluation, usePrefs, useSettings } from './state'
import { CatalogPicker, DealLines } from './rep/DealBuilder'
import { LadderView } from './rep/LadderView'
import { MiniReadout, Readout } from './rep/Readout'
import { TargetView } from './rep/TargetView'
import { RulesView } from './manager/RulesView'

type RepTab = 'deal' | 'ladder' | 'target'

export function App() {
  const { settings, setSettings, ctx } = useSettings()
  const [prefs, setPrefs] = usePrefs()
  const [{ deal, offers }, dispatch] = useDeal()
  const ev = useEvaluation(deal, ctx)
  const [tab, setTab] = useState<RepTab>('deal')
  const rep = REPS.find((r) => r.id === prefs.repId) ?? REPS[0]
  const store = STORES.find((s) => s.id === rep.storeId)!

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28"><rect width="32" height="32" rx="7" fill="#1f4f4a" /><g stroke="#f3efe6" strokeWidth="2.6" strokeLinecap="round"><path d="M10 6v20M22 6v20" /><path d="M10 10h12M10 16h12M10 22h12" stroke="#e0b25a" /></g></svg>
          </span>
          <div>
            <div className="name">OfferLadder</div>
            <div className="sub">{COMPANY} · a made-up store</div>
          </div>
        </div>
        <div className="top-controls">
          <div className="seg" role="group" aria-label="Role">
            <button type="button" className={prefs.role === 'rep' ? 'on' : ''} aria-pressed={prefs.role === 'rep'} onClick={() => setPrefs({ role: 'rep' })}>Rep</button>
            <button type="button" className={prefs.role === 'manager' ? 'on' : ''} aria-pressed={prefs.role === 'manager'} onClick={() => setPrefs({ role: 'manager' })}>Manager</button>
          </div>
          {prefs.role === 'rep' && (
            <select aria-label="Which rep" value={rep.id} onChange={(e) => setPrefs({ repId: e.target.value })}>
              {REPS.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({STORES.find((s) => s.id === r.storeId)!.name})</option>
              ))}
            </select>
          )}
          <label className="toggle">
            <input type="checkbox" checked={prefs.guide} onChange={(e) => setPrefs({ guide: e.target.checked })} />
            Demo guide
          </label>
        </div>
      </header>

      {prefs.role === 'rep' ? (
        <main className="rep">
          <nav className="tabs" aria-label="Rep screens">
            {(['deal', 'ladder', 'target'] as RepTab[]).map((t) => (
              <button key={t} type="button" className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
                {t === 'deal' ? 'Deal' : t === 'ladder' ? 'Offer ladder' : 'Target a tier'}
              </button>
            ))}
            <span className="spacer" />
            <button type="button" className="link" onClick={() => dispatch({ type: 'replace', deal: sampleDeal() })}>Load sample deal</button>
            <button type="button" className="link" onClick={() => dispatch({ type: 'clear' })}>New customer</button>
          </nav>
          <Guide on={prefs.guide && tab === 'deal'}>
            You're {rep.name} on the {store.name} sales floor. Build the customer's bundle and the numbers on the right
            update as you type: what they pay, your tier and your commission (paid on gross profit dollars, not the
            price). Price-locked items can't be discounted; prices below the margin floor are blocked.
          </Guide>
          <div className="columns">
            <div className="main-col">
              {tab === 'deal' && (
                <>
                  <CatalogPicker ctx={ctx} dispatch={dispatch} />
                  <DealLines deal={deal} ev={ev} ctx={ctx} dispatch={dispatch} />
                </>
              )}
              {tab === 'ladder' && <LadderView deal={deal} ctx={ctx} dispatch={dispatch} guide={prefs.guide} onUse={() => setTab('deal')} />}
              {tab === 'target' && <TargetView deal={deal} ctx={ctx} dispatch={dispatch} guide={prefs.guide} onUse={() => setTab('deal')} />}
            </div>
            <div className="side-col">
              <Readout deal={deal} ev={ev} ctx={ctx} offers={offers} dispatch={dispatch} />
            </div>
          </div>
          <MiniReadout ev={ev} />
        </main>
      ) : (
        <main className="manager">
          <nav className="tabs" aria-label="Manager screens">
            <button type="button" className="on" aria-current="page">Rules</button>
          </nav>
          <RulesView key={JSON.stringify(settings)} settings={settings} onSave={setSettings} guide={prefs.guide} />
        </main>
      )}
    </div>
  )
}

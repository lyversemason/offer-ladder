import { useState } from 'react'
import { COMPANY, MANAGER, REPS, STORES } from '../data/org'
import { saveSettings } from '../db/database'
import { Guide } from './bits'
import { useDatabase } from './db'
import { sampleDeal, useDeal, useEvaluation, usePrefs, useSettings } from './state'
import { CatalogPicker, DealLines } from './rep/DealBuilder'
import { LadderView } from './rep/LadderView'
import { MiniReadout, Readout } from './rep/Readout'
import { RecordOutcome } from './rep/RecordOutcome'
import { TargetView } from './rep/TargetView'
import { ImportView } from './manager/ImportView'
import { QueryLab } from './manager/QueryLab'
import { ReportsView } from './manager/ReportsView'
import { RulesView } from './manager/RulesView'

type RepTab = 'deal' | 'ladder' | 'target'
type ManagerTab = 'rules' | 'reports' | 'import' | 'lab'

const MANAGER_TABS: { id: ManagerTab; label: string }[] = [
  { id: 'reports', label: 'Reports' },
  { id: 'rules', label: 'Rules' },
  { id: 'import', label: 'Catalog import' },
  { id: 'lab', label: 'Query lab' },
]

const todayIso = () => new Date().toISOString().slice(0, 10)

export function App() {
  const data = useDatabase()
  const { settings, setSettings, ctx, products } = useSettings(data.catalog)
  const [prefs, setPrefs] = usePrefs()
  const [{ deal, offers }, dispatch] = useDeal()
  const ev = useEvaluation(deal, ctx)
  const [tab, setTab] = useState<RepTab>('deal')
  const [managerTab, setManagerTab] = useState<ManagerTab>('reports')
  const [recording, setRecording] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const rep = REPS.find((r) => r.id === prefs.repId) ?? REPS[0]
  const store = STORES.find((s) => s.id === rep.storeId)!

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28"><rect width="32" height="32" rx="7" fill="#1f4f4a" /><g stroke="#f3efe6" strokeWidth="2.6" strokeLinecap="round"><path d="M10 6v20M22 6v20" /><path d="M10 10h12M10 16h12M10 22h12" stroke="#d9c3a0" /></g></svg>
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
          {prefs.role === 'rep' ? (
            <select aria-label="Which rep" value={rep.id} onChange={(e) => setPrefs({ repId: e.target.value })}>
              {REPS.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({STORES.find((s) => s.id === r.storeId)!.name})</option>
              ))}
            </select>
          ) : (
            <span className="small muted">{MANAGER.name}, {MANAGER.title.toLowerCase()}</span>
          )}
          <label className="toggle">
            <input type="checkbox" checked={prefs.guide} onChange={(e) => setPrefs({ guide: e.target.checked })} />
            Demo guide
          </label>
        </div>
      </header>

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button type="button" className="link" onClick={() => setToast(null)}>Dismiss</button>
        </div>
      )}

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
            <button type="button" className="link" onClick={() => { dispatch({ type: 'clear' }); setRecording(false) }}>New customer</button>
          </nav>
          <Guide on={prefs.guide && tab === 'deal'}>
            You're {rep.name} on the {store.name} sales floor. Build the customer's bundle and the numbers update as you
            go: what they pay, your tier and your commission (paid on gross profit dollars, not the price). Price-locked
            items can't be discounted; prices below the margin floor are blocked. When the customer decides, record the
            outcome and it shows up in the manager's reports.
          </Guide>
          <div className="columns">
            <div className="main-col">
              {tab === 'deal' && (
                <>
                  <CatalogPicker ctx={ctx} products={products} dispatch={dispatch} />
                  <DealLines deal={deal} ev={ev} ctx={ctx} dispatch={dispatch} />
                </>
              )}
              {tab === 'ladder' && <LadderView deal={deal} ctx={ctx} dispatch={dispatch} guide={prefs.guide} onUse={() => setTab('deal')} />}
              {tab === 'target' && <TargetView deal={deal} ctx={ctx} dispatch={dispatch} guide={prefs.guide} onUse={() => setTab('deal')} />}
            </div>
            <div className="side-col">
              <Readout deal={deal} ev={ev} ctx={ctx} offers={offers} dispatch={dispatch} onRecord={() => setRecording(true)} />
              {recording && ev.toplineCents > 0 && (
                <section className="card">
                  <RecordOutcome
                    db={data.db}
                    rep={rep}
                    deal={deal}
                    ev={ev}
                    ctx={ctx}
                    offers={offers}
                    onCancel={() => setRecording(false)}
                    onDone={(message) => {
                      data.changed()
                      setRecording(false)
                      setToast(message)
                      dispatch({ type: 'clear' })
                    }}
                  />
                </section>
              )}
            </div>
          </div>
          <MiniReadout ev={ev} />
        </main>
      ) : (
        <main className="manager">
          <nav className="tabs" aria-label="Manager screens">
            {MANAGER_TABS.map((t) => (
              <button key={t.id} type="button" className={managerTab === t.id ? 'on' : ''} aria-current={managerTab === t.id ? 'page' : undefined} onClick={() => setManagerTab(t.id)}>
                {t.label}
              </button>
            ))}
            <span className="spacer" />
            <button
              type="button"
              className="link"
              onClick={() => {
                if (!confirmReset) return setConfirmReset(true)
                data.reset()
                setConfirmReset(false)
                setToast('The demo data is back to its starting point.')
              }}
              onBlur={() => setConfirmReset(false)}
            >
              {confirmReset ? 'Click again to erase recorded deals' : 'Reset demo data'}
            </button>
          </nav>
          {managerTab === 'rules' && (
            <RulesView
              key={JSON.stringify(settings)}
              settings={settings}
              products={products}
              guide={prefs.guide}
              onSave={(s) => {
                setSettings(s)
                if (data.db) {
                  saveSettings(data.db, todayIso(), s)
                  data.changed()
                }
                setToast('Rules saved. Reps see them right away.')
              }}
            />
          )}
          {managerTab !== 'rules' && data.status === 'loading' && <section className="card"><p className="muted">Loading the database…</p></section>}
          {managerTab !== 'rules' && data.status === 'error' && <section className="card"><p className="issue block">The database couldn't load in this browser.</p></section>}
          {data.db && data.status === 'ready' && (
            <>
              {managerTab === 'reports' && <ReportsView db={data.db} rev={data.rev} guide={prefs.guide} />}
              {managerTab === 'import' && <ImportView db={data.db} guide={prefs.guide} onApplied={data.changed} />}
              {managerTab === 'lab' && <QueryLab db={data.db} guide={prefs.guide} />}
            </>
          )}
        </main>
      )}
    </div>
  )
}

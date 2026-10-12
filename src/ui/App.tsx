import { useState } from 'react'
import { COMPANY, MANAGER, REPS, STORES } from '../data/org'
import { saveSettings } from '../db/database'
import { Guide } from './bits'
import { useDatabase } from './db'
import { sampleDeal, useDeal, useEvaluation, usePrefs, useSettings } from './state'
import { GmCalculator } from './rep/GmCalculator'
import { InventoryView } from './rep/InventoryView'
import { Lookup } from './rep/Lookup'
import { SkuBar } from './rep/SkuBar'
import { Ticket } from './rep/Ticket'
import { Iterations } from './rep/Iterations'
import { MiniReadout, Readout } from './rep/Readout'
import { RecordOutcome } from './rep/RecordOutcome'
import { ImportView } from './manager/ImportView'
import { QueryLab } from './manager/QueryLab'
import { ReportsView } from './manager/ReportsView'
import { RulesView } from './manager/RulesView'

type RepTab = 'ticket' | 'gm' | 'inventory'

const REP_TABS: { id: RepTab; label: string }[] = [
  { id: 'ticket', label: 'Ticket' },
  { id: 'gm', label: 'GM calculator' },
  { id: 'inventory', label: 'Inventory' },
]
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
  const [{ deal, reasons, offers }, dispatch] = useDeal()
  const ev = useEvaluation(deal, ctx)
  const [tab, setTab] = useState<RepTab>('ticket')
  const [lookupOpen, setLookupOpen] = useState(false)
  const addItem = (sku: string) => dispatch({ type: 'add', sku })
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
            {REP_TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
            <span className="spacer" />
            <button type="button" className="link" onClick={() => dispatch({ type: 'replace', deal: sampleDeal() })}>Load sample deal</button>
            <button type="button" className="link" onClick={() => { dispatch({ type: 'clear' }); setRecording(false) }}>New customer</button>
          </nav>
          <Guide on={prefs.guide && tab === 'ticket'}>
            You're {rep.name} on the {store.name} sales floor. Build the customer's ticket: type a SKU or a name, or use
            Look up if you don't know it. Change a price right on the row, take dollars or a percent off one item or the
            whole ticket, and the numbers on the right update as you go: what they pay, your tier and your commission
            (paid on gross profit dollars, not the price). Any item can go below its cost, even free, but the ticket as a
            whole has to make money. Each time you tell the customer a price, press "I offered this price": the ticket
            is saved as an iteration and you keep working in the next one. When they decide, record the outcome and it
            shows up in the manager's reports.
          </Guide>
          {tab === 'inventory' ? (
            <InventoryView products={products} settings={settings} guide={prefs.guide} onAdd={addItem} />
          ) : (
          <div className="columns">
            <div className="main-col">
              {tab === 'ticket' && (
                <>
                  <Iterations offers={offers} settings={settings} />
                  <SkuBar
                    products={products}
                    settings={settings}
                    onAdd={addItem}
                    lookupOpen={lookupOpen}
                    onLookup={() => setLookupOpen(!lookupOpen)}
                    onInventory={() => setTab('inventory')}
                  />
                  {lookupOpen && <Lookup products={products} settings={settings} onAdd={addItem} onClose={() => setLookupOpen(false)} />}
                  <Ticket deal={deal} ev={ev} ctx={ctx} products={products} reasons={reasons} iteration={offers.length + 1} dispatch={dispatch} />
                </>
              )}
              {tab === 'gm' && <GmCalculator deal={deal} ev={ev} ctx={ctx} guide={prefs.guide} />}
            </div>
            <div className="side-col">
              <Readout deal={deal} ev={ev} ctx={ctx} reasons={reasons} offers={offers} dispatch={dispatch} onRecord={() => setRecording(true)} />
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
          )}
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

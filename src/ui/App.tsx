import { useEffect, useLayoutEffect, useState } from 'react'
import { COMPANY, MANAGER, REPS, STORES } from '../data/org'
import type { Rep } from '../data/org'
import type { Person } from '../data/access'
import type { DataSource } from '../source/types'
import { Guide } from './bits'
import { openDemo, useDataSource } from './db'
import type { DataHandle } from './db'
import { sampleDeal, useDeal, useEvaluation, usePrefs, useSettings } from './state'
import { createTracker, loadStoredSession, storeSession, TrackContext } from './usage'
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
import { PatternsView } from './manager/PatternsView'
import { UsageView } from './manager/UsageView'

type RepTab = 'ticket' | 'gm' | 'inventory'

const REP_TABS: { id: RepTab; label: string }[] = [
  { id: 'ticket', label: 'Ticket' },
  { id: 'gm', label: 'GM calculator' },
  { id: 'inventory', label: 'Inventory' },
]
type ManagerTab = 'rules' | 'reports' | 'usage' | 'patterns' | 'import' | 'lab'

const MANAGER_TABS: { id: ManagerTab; label: string }[] = [
  { id: 'reports', label: 'Reports' },
  { id: 'usage', label: 'Usage' },
  { id: 'patterns', label: 'Deal patterns' },
  { id: 'rules', label: 'Rules' },
  { id: 'import', label: 'Catalog import' },
  { id: 'lab', label: 'Query lab' },
]

interface TrackerInputs {
  source: DataSource | null
  rep: Rep
  ticket: { id: string; started: boolean }
}

/**
 * The usage tracker for the whole visit, plus update() to give it the latest
 * data source, rep and ticket after each render.
 */
function makeTracker(onStarted: () => void) {
  let cur: TrackerInputs | null = null
  const tracker = createTracker({
    log: () => {
      const source = cur?.source
      return source ? (e) => void source.logEvents([e]).catch((err: unknown) => console.error('Usage event not saved', err)) : null
    },
    rep: () => cur!.rep,
    ticket: () => cur!.ticket,
    markStarted: () => {
      // Flipped at once, so two events in a row can't both start the same ticket.
      cur = { ...cur!, ticket: { ...cur!.ticket, started: true } }
      onStarted()
    },
    loadSession: loadStoredSession,
    saveSession: storeSession,
  })
  const update = (next: TrackerInputs) => {
    // Keep "started" if this ticket was started a moment ago and the screen hasn't caught up.
    const keep = cur && cur.ticket.id === next.ticket.id && cur.ticket.started
    cur = keep ? { ...next, ticket: { ...next.ticket, started: true } } : next
  }
  return { ...tracker, update }
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/** Live mode: who's signed in, and a way out. The demo has none (pick anyone). */
export interface Identity {
  person: Person
  onSignOut: () => void
}

/** The public demo: the browser's own database, and the Rep / Manager switch. */
export function DemoApp() {
  const data = useDataSource(openDemo)
  return <App data={data} />
}

const ROLE_TITLE = { rep: 'Rep', manager: 'Store manager', admin: 'Admin' } as const

export function App({ data, identity }: { data: DataHandle; identity?: Identity }) {
  const { settings, ctx, products } = useSettings(data.catalog, data.settings)
  const [prefs, setPrefs] = usePrefs()
  const [dealState, dispatch] = useDeal()
  const { deal, reasons, offers, lineVia, ticketId } = dealState
  const ev = useEvaluation(deal, ctx)
  const [tab, setTab] = useState<RepTab>('ticket')
  const [lookupOpen, setLookupOpen] = useState(false)
  const [managerTab, setManagerTab] = useState<ManagerTab>('reports')
  const [recording, setRecording] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  // Live mode: the sign-in decides the screens (a rep never gets the manager's view).
  const person = identity?.person
  const role = person ? (person.role === 'rep' ? 'rep' : 'manager') : prefs.role
  const guide = person ? false : prefs.guide
  const rep = REPS.find((r) => r.id === (person ? person.repId : prefs.repId)) ?? REPS[0]
  const managerTabs = MANAGER_TABS.filter(
    // Live: the query lab is demo-only, the catalog import admin-only (Mason, 2026-11-01).
    (t) => !person || (t.id !== 'lab' && (t.id !== 'import' || person.role === 'admin')),
  )
  const store = STORES.find((s) => s.id === rep.storeId)!

  // Usage tracking. The tracker lives for the whole visit; after every render it's
  // told the current data source, rep and ticket.
  const [tracker] = useState(() => makeTracker(() => dispatch({ type: 'started' })))
  useLayoutEffect(() => {
    tracker.update({ source: data.source, rep, ticket: { id: ticketId, started: dealState.started } })
  })
  const { track } = tracker
  // Opening the rep view as someone is the demo's version of signing in.
  useEffect(() => {
    if (role === 'rep' && data.source) tracker.ensureSession()
  }, [role, rep.id, data.source, tracker])

  const addItem = (sku: string, how: 'sku' | 'search' | 'lookup' | 'inventory') => {
    track('item_added', { how, sku })
    dispatch({ type: 'add', sku })
  }
  const openTab = (t: RepTab) => {
    if (t !== tab && t === 'gm') track('gm_calculator_opened')
    if (t !== tab && t === 'inventory') track('inventory_opened')
    setTab(t)
  }
  const newCustomer = () => {
    if (dealState.started) track('ticket_abandoned', { value: offers.length })
    dispatch({ type: 'clear' })
    setRecording(false)
  }

  return (
    <TrackContext.Provider value={track}>
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
        {person ? (
          <div className="top-controls">
            <span className="small">
              <strong>{person.name}</strong>
              <span className="muted"> · {ROLE_TITLE[person.role]}{person.storeId ? `, ${STORES.find((x) => x.id === person.storeId)?.name}` : ', all stores'}</span>
            </span>
            <button type="button" className="small-btn" onClick={identity.onSignOut}>Sign out</button>
          </div>
        ) : (
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
        )}
      </header>

      {data.source && !data.source.saving && (
        <p className="issue warn storage-note" role="status">
          This browser's storage isn't answering, so the demo was built fresh for this visit and nothing you record will
          be kept. This usually means a second copy of the browser is still running in the background: quit the browser
          completely and open it again.
        </p>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button type="button" className="link" onClick={() => setToast(null)}>Dismiss</button>
        </div>
      )}

      {role === 'rep' ? (
        <main className="rep">
          <nav className="tabs" aria-label="Rep screens">
            {REP_TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => openTab(t.id)}>
                {t.label}
              </button>
            ))}
            <span className="spacer" />
            <button type="button" className="link" onClick={() => { track('sample_loaded'); dispatch({ type: 'replace', deal: sampleDeal() }) }}>Load sample deal</button>
            <button type="button" className="link" onClick={newCustomer}>New customer</button>
          </nav>
          <Guide on={guide && tab === 'ticket'}>
            You're {rep.name} on the {store.name} sales floor. Build the customer's ticket: type a SKU or a name, or use
            Look up if you don't know it. Change a price right on the row, take dollars or a percent off one item or the
            whole ticket, and the numbers on the right update as you go: what they pay, your tier and your commission
            (paid on gross profit dollars, not the price). Any item can go below its cost, even free, but the ticket as a
            whole has to make money. Each time you tell the customer a price, press "I offered this price": the ticket
            is saved as an iteration and you keep working in the next one. When they decide, record the outcome and it
            shows up in the manager's reports.
          </Guide>
          {tab === 'inventory' ? (
            <InventoryView products={products} settings={settings} guide={guide} onAdd={(sku) => addItem(sku, 'inventory')} />
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
                    onLookup={() => {
                      if (!lookupOpen) track('lookup_opened')
                      setLookupOpen(!lookupOpen)
                    }}
                    onInventory={() => openTab('inventory')}
                  />
                  {lookupOpen && <Lookup products={products} settings={settings} onAdd={(sku) => addItem(sku, 'lookup')} onClose={() => setLookupOpen(false)} />}
                  <Ticket deal={deal} ev={ev} ctx={ctx} products={products} reasons={reasons} iteration={offers.length + 1} dispatch={dispatch} />
                </>
              )}
              {tab === 'gm' && <GmCalculator deal={deal} ev={ev} ctx={ctx} guide={guide} />}
            </div>
            <div className="side-col">
              <Readout deal={deal} ev={ev} ctx={ctx} reasons={reasons} offers={offers} lineVia={lineVia} dispatch={dispatch} onRecord={() => setRecording(true)} />
              {recording && ev.toplineCents > 0 && (
                <section className="card">
                  <RecordOutcome
                    source={data.source}
                    rep={rep}
                    deal={deal}
                    ev={ev}
                    ctx={ctx}
                    offers={offers}
                    reasons={reasons}
                    lineVia={lineVia}
                    ticketId={ticketId}
                    onCancel={() => setRecording(false)}
                    onDone={(message) => {
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
            {managerTabs.map((t) => (
              <button key={t.id} type="button" className={managerTab === t.id ? 'on' : ''} aria-current={managerTab === t.id ? 'page' : undefined} onClick={() => setManagerTab(t.id)}>
                {t.label}
              </button>
            ))}
            <span className="spacer" />
            {!person && (
            <button
              type="button"
              className="link"
              onClick={() => {
                if (!confirmReset) return setConfirmReset(true)
                setConfirmReset(false)
                data.source?.reset().then(
                  () => setToast('The demo data is back to its starting point.'),
                  (e: unknown) => setToast(`The demo data couldn't be reset: ${e instanceof Error ? e.message : String(e)}`),
                )
              }}
              onBlur={() => setConfirmReset(false)}
            >
              {confirmReset ? 'Click again to erase recorded deals' : 'Reset demo data'}
            </button>
            )}
          </nav>
          {managerTab === 'rules' && (
            <RulesView
              key={JSON.stringify(settings)}
              settings={settings}
              products={products}
              guide={guide}
              readOnly={person && person.role !== 'admin' ? 'Only an admin can change the rules. You can try changes here to see what they would do; they aren’t saved.' : undefined}
              onSave={(s) => {
                if (!data.source) return setToast('The database is still loading. Try again in a moment.')
                data.source.saveSettings(s, todayIso()).then(
                  () => setToast('Rules saved. Reps see them right away.'),
                  (e: unknown) => setToast(`The rules weren't saved: ${e instanceof Error ? e.message : String(e)}`),
                )
              }}
            />
          )}
          {managerTab !== 'rules' && data.status === 'loading' && <section className="card"><p className="muted">Loading the database…</p></section>}
          {managerTab !== 'rules' && data.status === 'error' && <section className="card"><p className="issue block">The database couldn't load in this browser.</p></section>}
          {data.source && (
            <>
              {managerTab === 'reports' && <ReportsView source={data.source} rev={data.rev} guide={guide} />}
              {managerTab === 'usage' && <UsageView source={data.source} rev={data.rev} guide={guide} />}
              {managerTab === 'patterns' && <PatternsView source={data.source} rev={data.rev} guide={guide} />}
              {managerTab === 'import' && <ImportView source={data.source} guide={guide} />}
              {managerTab === 'lab' && <QueryLab source={data.source} guide={guide} />}
            </>
          )}
        </main>
      )}
    </div>
    </TrackContext.Provider>
  )
}

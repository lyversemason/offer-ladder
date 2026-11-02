import { useEffect, useState } from 'react'
import type { AuditAction, AuditEntry, PersonRecord } from '../../data/accounts'
import type { DataSource } from '../../source/types'
import { Guide } from '../bits'
import { describe, when } from '../accounts'

const KINDS: { id: string; label: string; actions: AuditAction[] }[] = [
  { id: 'all', label: 'Everything', actions: [] },
  { id: 'accounts', label: 'Invitations and access', actions: ['invited', 'invite_resent', 'invite_cancelled', 'invite_accepted', 'turned_off', 'turned_on', 'access_changed'] },
  { id: 'rules', label: 'Rule changes', actions: ['rules_changed'] },
  { id: 'catalog', label: 'Catalog imports', actions: ['catalog_imported'] },
]

/** The audit log: every account change, rule change and catalog import. Admins only in live mode; nobody can edit it. */
export function AuditView({ source, rev, guide }: { source: DataSource; rev: number; guide: boolean }) {
  const [data, setData] = useState<{ entries: AuditEntry[]; people: PersonRecord[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [personId, setPersonId] = useState('all')
  const [kind, setKind] = useState('all')

  useEffect(() => {
    let cancelled = false
    Promise.all([source.audit(), source.people()]).then(
      ([entries, people]) => !cancelled && setData({ entries, people }),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [source, rev])

  if (!data) return <section className="card"><p className="muted">{error ?? 'Loading the audit log…'}</p></section>
  const actions = KINDS.find((k) => k.id === kind)!.actions
  const shown = data.entries.filter(
    (e) => (personId === 'all' || e.actorId === personId || e.targetId === personId) && (!actions.length || actions.includes(e.action)),
  )
  return (
    <div className="audit">
      <Guide on={guide}>
        Every account change, rule change and catalog import, newest first, written in the same step as the change.
        Nobody can edit or delete it, the owner included. In live mode only admins see it.
      </Guide>
      <section className="card">
        <div className="row filters">
          <label>
            <span className="field-label">Person</span>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="all">Everyone</option>
              {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
          <span className="small muted">{shown.length} of {data.entries.length}</span>
        </div>
        <div className="table-scroll">
          <table className="grid data">
            <thead><tr><th>When</th><th>What happened</th></tr></thead>
            <tbody>
              {shown.map((e, i) => (
                <tr key={i}>
                  <td className="small nowrap">{when(e.at)}</td>
                  <td>{describe(e, data.people)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <p className="muted small">Nothing matches.</p>}
        </div>
      </section>
    </div>
  )
}

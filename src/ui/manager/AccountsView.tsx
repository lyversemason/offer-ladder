import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { canChangeAccess, canInvite, canManage } from '../../data/access'
import type { Role } from '../../data/access'
import type { AccountAction, PersonRecord } from '../../data/accounts'
import { STORES } from '../../data/org'
import type { AccountResult, DataSource } from '../../source/types'
import { Guide } from '../bits'
import { ROLE_LABEL, storeName, when } from '../accounts'

const STATUS_LABEL = { invited: 'Invited', active: 'Active', off: 'Access off' } as const

/**
 * Accounts: who can sign in, and their access. Managers see their store's people
 * and manage its reps; admins see and manage everyone. Every button follows the
 * rules in access.ts (and the server checks them again in live mode).
 */
export function AccountsView({ source, rev, actorId, guide }: { source: DataSource; rev: number; actorId: string; guide: boolean }) {
  const [people, setPeople] = useState<PersonRecord[] | null>(null)
  const [result, setResult] = useState<AccountResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOff, setConfirmOff] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    source.people().then(
      (list) => !cancelled && setPeople(list),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [source, rev])

  const actor = people?.find((p) => p.id === actorId) ?? null
  const name = (id: string | null) => people?.find((p) => p.id === id)?.name ?? id ?? ''

  const act = async (action: AccountAction) => {
    setBusy(true)
    setError(null)
    setConfirmOff(null)
    try {
      setResult(await source.accountAction(action))
      setEditing(null)
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!people) return <section className="card"><p className="muted">{error ?? 'Loading the people…'}</p></section>
  const groups = [
    ...(people.some((p) => p.role === 'admin') ? [{ id: null as string | null, title: 'Owner and admins', list: people.filter((p) => p.role === 'admin') }] : []),
    ...STORES.map((s) => ({ id: s.id as string | null, title: s.name, list: people.filter((p) => p.role !== 'admin' && p.storeId === s.id) })),
  ].filter((g) => g.list.length)

  return (
    <div className="accounts">
      <Guide on={guide}>
        Who can sign in to the live version, and their access. People are invited by email (there’s no sign-up and
        no password), and nobody is ever deleted: their access is turned off and their history stays. In the demo
        you’re the owner, so you can do everything, and the invitation email appears here instead of being sent. In
        live mode a store manager only sees their store and manages its reps, and the server checks every change.
      </Guide>
      {actor && <InviteForm actor={actor} busy={busy} onInvite={(a) => void act(a)} />}
      {error && <p className="issue block" role="alert">{error}</p>}
      {result && (
        <section className="card account-result" role="status">
          <p><strong>{result.message}</strong></p>
          {result.email && (
            <div className="email-preview">
              <p className="small muted">The invitation email (in live mode it’s sent to {result.email.to}):</p>
              <p><strong>{result.email.subject}</strong></p>
              <p>{result.email.body}</p>
              <button type="button" className="small-btn" disabled={busy} onClick={() => void act({ type: 'accept', id: result.email!.personId })}>
                Accept as {name(result.email.personId)} (demo)
              </button>
            </div>
          )}
        </section>
      )}
      {groups.map((g) => (
        <section key={g.id ?? 'admins'} className="card">
          <h2>{g.title}</h2>
          <div className="table-scroll">
            <table className="grid data people">
              <thead>
                <tr><th>Name</th><th>Role</th><th>Status</th><th>History</th><th /></tr>
              </thead>
              <tbody>
                {g.list.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="small muted">{p.email}</div>
                    </td>
                    <td>{ROLE_LABEL[p.role]}</td>
                    <td><span className={`status ${p.status}`}>{STATUS_LABEL[p.status]}</span></td>
                    <td className="small muted">
                      {p.status === 'invited' && p.invitedAt && <>Invited by {name(p.invitedBy)}, {when(p.invitedAt)}</>}
                      {p.status === 'active' && p.activatedAt && <>Joined {when(p.activatedAt)}</>}
                      {p.status === 'off' && p.turnedOffAt && <>Turned off by {name(p.turnedOffBy)}, {when(p.turnedOffAt)}</>}
                    </td>
                    <td>
                      <div className="row-actions">
                      {editing === p.id ? (
                        <ChangeAccess person={p} busy={busy} onSave={(role, storeId) => void act({ type: 'changeAccess', id: p.id, role, storeId })} onCancel={() => setEditing(null)} />
                      ) : (
                        <>
                          {p.status === 'invited' && canManage(actor, p) && (
                            <>
                              <button type="button" className="small-btn" disabled={busy} onClick={() => void act({ type: 'resend', id: p.id })}>Send again</button>
                              <button type="button" className="small-btn" disabled={busy} onClick={() => void act({ type: 'cancel', id: p.id })}>Cancel invitation</button>
                            </>
                          )}
                          {p.status === 'active' && canManage(actor, p) && (
                            <button
                              type="button"
                              className="small-btn"
                              disabled={busy}
                              onClick={() => (confirmOff === p.id ? void act({ type: 'turnOff', id: p.id }) : setConfirmOff(p.id))}
                              onBlur={() => setConfirmOff(null)}
                            >
                              {confirmOff === p.id ? 'Click again to turn off' : 'Turn off access'}
                            </button>
                          )}
                          {p.status === 'off' && canManage(actor, p) && (
                            <button type="button" className="small-btn" disabled={busy} onClick={() => void act({ type: 'turnOn', id: p.id })}>Turn back on</button>
                          )}
                          {p.role !== 'rep' && canChangeAccess(actor, p) && (
                            <button type="button" className="link small" disabled={busy} onClick={() => setEditing(p.id)}>Change role or store</button>
                          )}
                          {p.role === 'rep' && canChangeAccess(actor, p) && (
                            <button type="button" className="link small" disabled={busy} onClick={() => setEditing(p.id)}>Move store</button>
                          )}
                          {p.id === actorId && <span className="small muted">You</span>}
                        </>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

function InviteForm({ actor, busy, onInvite }: { actor: PersonRecord; busy: boolean; onInvite: (a: AccountAction) => void }) {
  const roles = (['rep', 'manager', 'admin'] as Role[]).filter((r) => STORES.some((s) => canInvite(actor, r, r === 'admin' ? null : s.id)) || (r === 'admin' && canInvite(actor, r, null)))
  const [nameText, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>(roles[0] ?? 'rep')
  const stores = STORES.filter((s) => canInvite(actor, role, s.id))
  const [storeId, setStoreId] = useState<string>(actor.storeId ?? STORES[0].id)
  if (!roles.length) return null
  const store = role === 'admin' ? null : stores.some((s) => s.id === storeId) ? storeId : (stores[0]?.id ?? null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onInvite({ type: 'invite', name: nameText, email, role, storeId: store })
  }
  return (
    <section className="card">
      <h2>Invite someone</h2>
      <form className="invite" onSubmit={submit}>
        <label>
          <span className="field-label">Name</span>
          <input value={nameText} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        <label>
          <span className="field-label">Work email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </label>
        {roles.length > 1 && (
          <label>
            <span className="field-label">Invite as</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
        )}
        {role !== 'admin' && (
          <label>
            <span className="field-label">At store</span>
            <select value={store ?? ''} onChange={(e) => setStoreId(e.target.value)} disabled={stores.length < 2}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <button type="submit" className="primary" disabled={busy}>Send invitation</button>
      </form>
      <p className="small muted">
        {actor.role === 'admin' ? 'You can invite anyone to any store.' : `As a store manager you invite reps to ${storeName(actor.storeId)}.`} The invitation is good for 7 days.
      </p>
    </section>
  )
}

function ChangeAccess({ person, busy, onSave, onCancel }: { person: PersonRecord; busy: boolean; onSave: (role: Role, storeId: string | null) => void; onCancel: () => void }) {
  const [role, setRole] = useState<Role>(person.role)
  const [storeId, setStoreId] = useState<string>(person.storeId ?? STORES[0].id)
  return (
    <span className="change-access">
      {person.role !== 'rep' && (
        <select aria-label={`New role for ${person.name}`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="manager">Store manager</option>
          <option value="admin">Admin</option>
        </select>
      )}
      {role !== 'admin' && (
        <select aria-label={`New store for ${person.name}`} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          {STORES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <button type="button" className="small-btn" disabled={busy} onClick={() => onSave(role, role === 'admin' ? null : storeId)}>Save</button>
      <button type="button" className="link small" onClick={onCancel}>Cancel</button>
    </span>
  )
}

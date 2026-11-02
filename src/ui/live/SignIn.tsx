import { useState } from 'react'
import type { FormEvent } from 'react'
import type { AuthState, LiveAuth } from '../../source/live'

function Brand() {
  return (
    <header className="signin-head">
      <span className="logo" aria-hidden>
        <svg viewBox="0 0 32 32" width="40" height="40"><rect width="32" height="32" rx="7" fill="#1f4f4a" /><g stroke="#f3efe6" strokeWidth="2.6" strokeLinecap="round"><path d="M10 6v20M22 6v20" /><path d="M10 10h12M10 16h12M10 22h12" stroke="#d9c3a0" /></g></svg>
      </span>
      <h1>OfferLadder</h1>
      <p className="muted">Lantern Lane Home</p>
    </header>
  )
}

/** Live mode's front door: email in, then the link or the 6-digit code from the same email. No sign-up. */
export function SignIn({ auth }: { auth: LiveAuth }) {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const attempt = async (work: () => Promise<void>) => {
    setError('')
    setBusy(true)
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const send = (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter your work email.')
    void attempt(async () => {
      await auth.sendCode(email)
      setSentTo(email.trim())
    })
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    void attempt(() => auth.verifyCode(sentTo, code))
  }

  return (
    <div className="signin">
      <Brand />
      <section className="card signin-card">
        {!sentTo ? (
          <form onSubmit={send}>
            <label className="field">
              <span>Work email</span>
              <input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
            <p className="small muted">No password. Accounts are created by invitation from your manager.</p>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p>
              A sign-in email is on its way to <strong>{sentTo}</strong>. Open its link on this device, or type the 6-digit code from it:
            </p>
            <label className="field">
              <span>Code</span>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </label>
            <div className="row">
              <button type="submit" className="primary" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Sign in'}</button>
              <button type="button" className="link" onClick={() => void attempt(() => auth.sendCode(sentTo))}>Send a new code</button>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setSentTo('')
                  setCode('')
                  setError('')
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}
        {error && <p className="issue block" role="alert">{error}</p>}
      </section>
    </div>
  )
}

const NO_ACCESS: Record<Extract<AuthState, { status: 'no-access' }>['reason'], string> = {
  off: 'Your access has been turned off.',
  invited: 'Your account isn’t set up yet. Open your invitation email to finish.',
  unknown: 'There’s no OfferLadder account for this email.',
}

/** Signed in, but not allowed in. */
export function NoAccess({ auth, state }: { auth: LiveAuth; state: Extract<AuthState, { status: 'no-access' }> }) {
  return (
    <div className="signin">
      <Brand />
      <section className="card signin-card">
        <h2>No access</h2>
        <p>
          {NO_ACCESS[state.reason]} If that’s a mistake, ask your store manager. (Signed in as <strong>{state.email}</strong>.)
        </p>
        <button type="button" onClick={() => void auth.signOut()}>Sign out</button>
      </section>
    </div>
  )
}

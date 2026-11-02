// Live mode's top level: the sign-in screen until someone signs in, then the app
// with their identity and the shared database. Loaded only in a live build, so
// the public demo never includes the database client.
import { useState, useSyncExternalStore } from 'react'
import type { Person } from '../../data/access'
import { createLive } from '../../source/live'
import type { Live } from '../../source/live'
import { App } from '../App'
import { useDataSource } from '../db'
import { NoAccess, SignIn } from './SignIn'

/** The app for one signed-in person (mounted fresh for each sign-in). */
function SignedIn({ live, person }: { live: Live; person: Person }) {
  const data = useDataSource(async () => live.source)
  return <App data={data} identity={{ person, onSignOut: () => void live.auth.signOut() }} />
}

export function LiveApp({ url, anonKey }: { url: string; anonKey: string }) {
  const [live] = useState(() => createLive(url, anonKey))
  const state = useSyncExternalStore(live.auth.subscribe, live.auth.get)
  if (state.status === 'loading') return <p className="signin muted">Loading…</p>
  if (state.status === 'signed-out') return <SignIn auth={live.auth} />
  if (state.status === 'no-access') return <NoAccess auth={live.auth} state={state} />
  return <SignedIn key={state.person.id} live={live} person={state.person} />
}

import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/styles.css'
import { DemoApp } from './ui/App'

const root = createRoot(document.getElementById('root')!)
const render = (node: ReactNode) => root.render(<StrictMode>{node}</StrictMode>)

// A live build (npm run dev:live) knows the database's address; the public demo doesn't.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
if (url && anonKey) {
  void import('./ui/live/LiveApp').then(({ LiveApp }) => render(<LiveApp url={url} anonKey={anonKey} />))
} else {
  render(<DemoApp />)
}

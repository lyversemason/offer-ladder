// Small shared pieces: tier badges, money inputs, demo-guide notes.
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Tier } from '../engine'
import { money, parseMoney, tierClass } from './format'

/** Colored label for a tier; "Below floor" in red when there's no tier. */
export function TierBadge({ tier, empty }: { tier: Tier | null; empty?: boolean }) {
  if (empty) return <span className="tier tier-none">No items</span>
  if (!tier) return <span className="tier tier-below">Below floor</span>
  return <span className={`tier tier-${tierClass(tier.id)}`}>{tier.label} tier</span>
}

/**
 * A dollar field that only changes the deal when you finish typing (Enter or
 * leaving the field), so the numbers don't jump around mid-keystroke.
 */
export function MoneyInput({
  cents,
  onCommit,
  disabled,
  label,
  id,
}: {
  cents: number
  onCommit: (cents: number) => void
  disabled?: boolean
  label: string
  id?: string
}) {
  // While typing, the field shows the draft; otherwise it shows the deal's number.
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const commit = () => {
    if (draft === null) return
    const value = parseMoney(draft)
    if (value === null) {
      setBad(true)
      return
    }
    setDraft(null)
    setBad(false)
    if (value !== cents) onCommit(value)
  }
  return (
    <input
      id={id}
      className={`money-input${bad ? ' bad' : ''}`}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={bad}
      value={draft ?? money(cents)}
      disabled={disabled}
      onFocus={(e) => {
        setDraft(money(cents))
        e.target.select()
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        setBad(false)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          setDraft(null)
          setBad(false)
        }
      }}
    />
  )
}

/** An explanation shown only while "Demo guide" is on. */
export function Guide({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return null
  return (
    <aside className="guide">
      <span className="guide-label">Demo guide</span>
      {children}
    </aside>
  )
}

export function Signed({ cents }: { cents: number }) {
  if (cents === 0) return <span>{money(0)}</span>
  return <span className={cents > 0 ? 'pos' : 'neg'}>{cents > 0 ? '+' : '−'}{money(Math.abs(cents))}</span>
}

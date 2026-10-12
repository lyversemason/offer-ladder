import { useEffect, useMemo, useRef, useState } from 'react'
import { isLocked } from '../../engine'
import type { Product, Settings } from '../../engine'
import { productName } from '../../data/catalog'
import { money } from '../format'
import { searchProducts } from '../search'

/**
 * The always-ready item box: type a SKU or part of a name, pick with the arrow
 * keys or the mouse, Enter adds it to the ticket.
 */
export function SkuBar({
  products,
  settings,
  onAdd,
  lookupOpen,
  onLookup,
  onInventory,
}: {
  products: Product[]
  settings: Settings
  onAdd: (sku: string) => void
  lookupOpen: boolean
  onLookup: () => void
  onInventory: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const results = useMemo(() => searchProducts(products, query), [products, query])
  const at = Math.min(active, Math.max(0, results.length - 1))
  const input = useRef<HTMLInputElement>(null)

  // Ready to type on a desktop; on a phone, opening the keyboard uninvited is rude.
  useEffect(() => {
    if (window.matchMedia('(min-width: 861px)').matches) input.current?.focus()
  }, [])

  const add = (p: Product) => {
    onAdd(p.sku)
    setQuery('')
    setActive(0)
    input.current?.focus()
  }

  return (
    <section className="card skubar" aria-label="Add an item">
      <div className="skubar-row">
        <div className="combo">
          <label className="field-label" htmlFor="sku">Item</label>
          <input
            id="sku"
            ref={input}
            className="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="sku-results"
            aria-activedescendant={results.length ? `sku-opt-${at}` : undefined}
            autoComplete="off"
            placeholder="Type a SKU or a name (e.g. 366239, or golden queen)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && results.length) {
                e.preventDefault()
                setActive((at + 1) % results.length)
              } else if (e.key === 'ArrowUp' && results.length) {
                e.preventDefault()
                setActive((at - 1 + results.length) % results.length)
              } else if (e.key === 'Enter' && results.length) {
                e.preventDefault()
                add(results[at])
              } else if (e.key === 'Escape') {
                setQuery('')
              }
            }}
          />
          {results.length > 0 && (
            <ul id="sku-results" role="listbox" className="combo-list" aria-label="Matching items">
              {results.map((p, i) => (
                <li
                  key={p.sku}
                  id={`sku-opt-${i}`}
                  role="option"
                  aria-selected={i === at}
                  className={i === at ? 'on' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    add(p)
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="code">{p.sku}</span>
                  <span className="nm">
                    {productName(p)}
                    {isLocked(p, settings) && <span className="lock">locked</span>}
                  </span>
                  <span className="price">{money(p.listCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="skubar-buttons">
          <button type="button" aria-pressed={lookupOpen} className={lookupOpen ? 'on' : ''} onClick={onLookup}>Look up</button>
          <button type="button" onClick={onInventory}>Inventory</button>
        </div>
      </div>
      {query.trim() && results.length === 0 && (
        <p className="small muted">Nothing matches “{query.trim()}”. Try part of the model name, or Look up.</p>
      )}
    </section>
  )
}

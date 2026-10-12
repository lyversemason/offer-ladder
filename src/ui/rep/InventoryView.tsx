import { useMemo, useState } from 'react'
import { isLocked, listMarginBp } from '../../engine'
import type { Category, Product, Settings } from '../../engine'
import { CATEGORY_LABELS } from '../../data/catalog'
import { Guide } from '../bits'
import { money, pct } from '../format'
import { searchProducts } from '../search'

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[]

/** Every item in the store with its price, cost and margin, new and outlet. */
export function InventoryView({
  products,
  settings,
  guide,
  onAdd,
}: {
  products: Product[]
  settings: Settings
  guide: boolean
  onAdd: (sku: string) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const [brand, setBrand] = useState('')
  const [lockedOnly, setLockedOnly] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand))], [products])
  const shown = useMemo(() => {
    const base = query.trim() ? searchProducts(products, query, products.length) : products
    return base.filter(
      (p) => (!category || p.category === category) && (!brand || p.brand === brand) && (!lockedOnly || isLocked(p, settings)),
    )
  }, [products, query, category, brand, lockedOnly, settings])

  return (
    <section className="card inventory" aria-label="Inventory">
      <Guide on={guide}>
        The whole catalog: every model in every size, with its price, what it costs the store and the margin at full
        price. Outlet (pre-owned) pieces sell 20% off and cost the store less. Price-locked models can't be discounted.
      </Guide>
      <div className="card-head">
        <h2>Inventory</h2>
        <span className="small muted">{shown.length} of {products.length} items</span>
      </div>
      <div className="form-row">
        <input className="inv-search" type="search" aria-label="Search the inventory" placeholder="SKU or name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <select aria-label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">All brands</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={lockedOnly} onChange={(e) => setLockedOnly(e.target.checked)} />
          Price-locked only
        </label>
      </div>
      {added && <p className="small promo" role="status">{added}</p>}
      <div className="table-scroll">
        <table className="grid data inv-table">
          <thead>
            <tr>
              <th>Item code</th><th>Brand</th><th>Model</th><th>Size</th>
              <th className="num">Price</th><th className="num">Cost</th><th className="num">Margin</th>
              <th className="num">Outlet price</th><th className="num">Outlet cost</th><th className="num">Outlet margin</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.sku}>
                <td className="code">{p.sku}</td>
                <td>{p.brand}</td>
                <td>
                  {p.model}
                  {isLocked(p, settings) && <span className="lock">locked</span>}
                </td>
                <td>{p.size}</td>
                <td className="num">{money(p.listCents)}</td>
                <td className="num">{money(p.costCents)}</td>
                <td className="num">{pct(listMarginBp(p))}</td>
                <td className="num">{p.outlet ? money(p.outlet.listCents) : '—'}</td>
                <td className="num">{p.outlet ? money(p.outlet.costCents) : '—'}</td>
                <td className="num">{p.outlet ? pct(listMarginBp(p.outlet)) : '—'}</td>
                <td>
                  <button
                    type="button"
                    className="small-btn"
                    aria-label={`Add ${p.brand} ${p.model} ${p.size} to the ticket`}
                    onClick={() => {
                      onAdd(p.sku)
                      setAdded(`${p.brand} ${p.model} (${p.size}) is on the ticket.`)
                    }}
                  >
                    Add
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

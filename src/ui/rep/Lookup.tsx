import { useMemo, useState } from 'react'
import { isLocked } from '../../engine'
import type { Category, Product, Settings } from '../../engine'
import { CATEGORY_LABELS } from '../../data/catalog'
import { money } from '../format'

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[]

/**
 * For reps who don't know the SKU: pick a category, then a brand, then a model,
 * then a size. Each step only shows what the catalog really has.
 */
export function Lookup({
  products,
  settings,
  onAdd,
  onClose,
}: {
  products: Product[]
  settings: Settings
  onAdd: (sku: string) => void
  onClose: () => void
}) {
  const [category, setCategory] = useState<Category | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const [modelSku, setModelSku] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  const inCategory = useMemo(() => products.filter((p) => p.category === category), [products, category])
  const brands = useMemo(() => [...new Set(inCategory.map((p) => p.brand))], [inCategory])
  const models = useMemo(() => {
    const byModel = new Map<string, Product[]>()
    for (const p of inCategory.filter((p) => p.brand === brand)) byModel.set(p.modelSku, [...(byModel.get(p.modelSku) ?? []), p])
    return [...byModel.values()]
  }, [inCategory, brand])
  const sizes = products.filter((p) => p.modelSku === modelSku)

  const back = (to: 'start' | 'category' | 'brand') => {
    setAdded(null)
    if (to === 'start') setCategory(null)
    if (to !== 'brand') setBrand(null)
    setModelSku(null)
  }

  return (
    <section className="card lookup" aria-label="Look up an item">
      <div className="card-head">
        <nav className="crumbs" aria-label="Look up steps">
          <button type="button" className="link" onClick={() => back('start')}>All items</button>
          {category && <><span aria-hidden>›</span><button type="button" className="link" onClick={() => back('category')}>{CATEGORY_LABELS[category]}</button></>}
          {brand && <><span aria-hidden>›</span><button type="button" className="link" onClick={() => back('brand')}>{brand}</button></>}
          {modelSku && sizes[0] && <><span aria-hidden>›</span><span>{sizes[0].model}</span></>}
        </nav>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>

      {!category && (
        <div className="pick-grid">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className="pick" onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c]}
              <span className="small muted">{new Set(products.filter((p) => p.category === c).map((p) => p.modelSku)).size} models</span>
            </button>
          ))}
        </div>
      )}

      {category && !brand && (
        <div className="pick-grid">
          {brands.map((b) => (
            <button key={b} type="button" className="pick" onClick={() => setBrand(b)}>
              {b}
              <span className="small muted">{new Set(inCategory.filter((p) => p.brand === b).map((p) => p.modelSku)).size} models</span>
            </button>
          ))}
        </div>
      )}

      {brand && !modelSku && (
        <div className="pick-grid">
          {models.map((m) => {
            const from = Math.min(...m.map((p) => p.listCents))
            return (
              <button key={m[0].modelSku} type="button" className="pick" onClick={() => setModelSku(m[0].modelSku)}>
                <span>
                  {m[0].model}
                  {isLocked(m[0], settings) && <span className="lock">locked</span>}
                </span>
                <span className="small muted">SKU {m[0].modelSku} · {m.length} sizes · from {money(from)}</span>
              </button>
            )
          })}
        </div>
      )}

      {modelSku && (
        <>
          <div className="pick-grid sizes">
            {sizes.map((p) => (
              <button
                key={p.sku}
                type="button"
                className="pick"
                onClick={() => {
                  onAdd(p.sku)
                  setAdded(`${p.model} (${p.size}) is on the ticket.`)
                }}
              >
                {p.size}
                <span className="small muted">{p.sku} · {money(p.listCents)}</span>
              </button>
            ))}
          </div>
          {added && <p className="small promo" role="status">{added} Pick another size, or close.</p>}
        </>
      )}
    </section>
  )
}

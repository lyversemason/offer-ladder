// Finding items the way a rep types: an item code or SKU ("366239", "366239-q"),
// or a few words of the name and size ("golden queen").
import type { Product } from '../engine'

const squash = (s: string) => s.toLowerCase().replace(/[\s-]/g, '')

export function searchProducts(products: Product[], query: string, limit = 8): Product[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  if (/^\d/.test(q)) {
    const code = squash(q)
    const hits = products.filter((p) => squash(p.sku).startsWith(code))
    // An exact item code first, then the model's other sizes in catalog order.
    return hits.sort((a, b) => Number(squash(b.sku) === code) - Number(squash(a.sku) === code)).slice(0, limit)
  }
  const words = q.split(/\s+/)
  const hits = products.filter((p) => {
    const hay = `${p.brand} ${p.model} ${p.size ?? ''} ${p.sku} ${p.category}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  // A size typed in full ("queen") ranks that exact size above "Split Queen".
  const exactSize = (p: Product) => (p.size && words.join(' ').includes(p.size.toLowerCase()) ? 0 : 1)
  return hits.sort((a, b) => exactSize(a) - exactSize(b)).slice(0, limit)
}

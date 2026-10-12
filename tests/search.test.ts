import { describe, expect, it } from 'vitest'
import { searchProducts } from '../src/ui/search'
import { CATALOG } from '../src/data/catalog'

const skus = (q: string) => searchProducts(CATALOG, q).map((p) => p.sku)

describe('item search', () => {
  it('finds every size of a model from its SKU', () => {
    expect(skus('366239')).toEqual(['366239-TX', '366239-F', '366239-Q', '366239-K', '366239-CK'])
  })

  it('puts the exact item code first, with or without the dash', () => {
    expect(skus('366239-q')[0]).toBe('366239-Q')
    expect(skus('366239q')[0]).toBe('366239-Q')
  })

  it('matches words of the name and size, exact size first', () => {
    const hits = searchProducts(CATALOG, 'golden queen')
    expect(hits[0].sku).toBe('366239-Q')
    expect(searchProducts(CATALOG, 'snug cottage queen')[0].size).toBe('Queen')
  })

  it('returns nothing for an empty box or no match', () => {
    expect(skus('  ')).toEqual([])
    expect(skus('waterbed')).toEqual([])
  })
})

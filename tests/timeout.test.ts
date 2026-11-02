import { describe, expect, it } from 'vitest'
import { withTimeout } from '../src/ui/timeout'

describe('withTimeout (the app never waits forever on browser storage)', () => {
  it('gives the answer when it comes in time', async () => {
    expect(await withTimeout(Promise.resolve('saved copy'), 50, 'none')).toBe('saved copy')
  })
  it('gives the fallback when nothing answers', async () => {
    expect(await withTimeout(new Promise<string>(() => {}), 20, 'none')).toBe('none')
  })
  it('gives the fallback when it fails', async () => {
    expect(await withTimeout(Promise.reject(new Error('refused')), 50, 'none')).toBe('none')
  })
})

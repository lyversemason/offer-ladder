/**
 * Waits for a promise, but no longer than `ms`: after that it settles with
 * `fallback` instead. For browser features that can stop answering (storage
 * locked by another copy of the browser), so the app never waits forever.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

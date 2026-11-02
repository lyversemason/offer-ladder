// Who may see what (src/data/access.ts). The live database applies the same
// rules; tests/db/access.test.ts checks it agrees with these for every person.
import { describe, expect, it } from 'vitest'
import { canSee, canSeePerson, canSeeShared } from '../src/data/access'
import type { Person } from '../src/data/access'
import { PEOPLE, REPS } from '../src/data/org'

const person = (id: string) => PEOPLE.find((p) => p.id === id)!
const tasha = { repId: 'tasha', storeId: 'riverside' }
const ben = { repId: 'ben', storeId: 'hillcrest' }

describe('the people', () => {
  it('has the owner, two store managers, a former manager and every rep', () => {
    expect(PEOPLE.filter((p) => p.role === 'admin').map((p) => p.id)).toEqual(['dana'])
    expect(PEOPLE.filter((p) => p.role === 'manager' && p.status === 'active').map((p) => p.storeId).sort()).toEqual(['hillcrest', 'riverside'])
    expect(PEOPLE.filter((p) => p.role === 'rep').map((p) => p.repId)).toEqual(REPS.map((r) => r.id))
    expect(new Set(PEOPLE.map((p) => p.email)).size).toBe(PEOPLE.length)
    for (const p of PEOPLE) expect(p.email).toMatch(/@lanternlane\.test$/)
  })
})

describe('canSee', () => {
  it('an admin sees every record', () => {
    expect(canSee(person('dana'), tasha)).toBe(true)
    expect(canSee(person('dana'), ben)).toBe(true)
  })

  it('a store manager sees their store only', () => {
    expect(canSee(person('lena'), tasha)).toBe(true)
    expect(canSee(person('lena'), ben)).toBe(false)
    expect(canSee(person('marisol'), ben)).toBe(true)
  })

  it('a rep sees their own records only, not a teammate’s', () => {
    expect(canSee(person('tasha'), tasha)).toBe(true)
    expect(canSee(person('kevin'), tasha)).toBe(false)
  })

  it('nobody sees anything with their access turned off, invited but not signed in, or signed out', () => {
    expect(canSee(person('owen'), ben)).toBe(false)
    expect(canSee({ ...person('dana'), status: 'invited' }, tasha)).toBe(false)
    expect(canSee(null, tasha)).toBe(false)
    expect(canSeeShared(person('owen'))).toBe(false)
    expect(canSeeShared(person('kevin'))).toBe(true)
  })
})

describe('canSeePerson', () => {
  it('everyone sees themselves (even with access off); managers their store’s people; admins everyone', () => {
    const at = (viewer: string) => PEOPLE.filter((p) => canSeePerson(person(viewer), p)).map((p) => p.id)
    expect(at('kevin')).toEqual(['kevin'])
    expect(at('lena').sort()).toEqual(['kevin', 'lena', 'marcus', 'renee', 'tasha'])
    expect(at('marisol').sort()).toEqual(['andre', 'ben', 'marisol', 'owen', 'sofia'])
    expect(at('dana')).toHaveLength(PEOPLE.length)
    // Owen's access is off: he sees only his own account (to be told so), nobody else's.
    expect(at('owen')).toEqual(['owen'])
    const stranger: Person = { ...person('kevin'), id: 'x', status: 'off' }
    expect(canSeePerson(stranger, person('kevin'))).toBe(false)
    expect(canSeePerson(null, person('kevin'))).toBe(false)
  })
})

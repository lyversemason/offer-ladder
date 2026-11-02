// The made-up company: two stores, seven reps, two store managers and the owner.
import type { Person } from './access'

export interface Store {
  id: string
  name: string
}

export interface Rep {
  id: string
  name: string
  storeId: string
}

export const COMPANY = 'Lantern Lane Home'

export const STORES: Store[] = [
  { id: 'riverside', name: 'Riverside' },
  { id: 'hillcrest', name: 'Hillcrest' },
]

export const REPS: Rep[] = [
  { id: 'tasha', name: 'Tasha Ortiz', storeId: 'riverside' },
  { id: 'kevin', name: 'Kevin Lu', storeId: 'riverside' },
  { id: 'renee', name: 'Renee Park', storeId: 'riverside' },
  { id: 'marcus', name: 'Marcus Bell', storeId: 'riverside' },
  { id: 'andre', name: 'Andre Fields', storeId: 'hillcrest' },
  { id: 'sofia', name: 'Sofia Marchetti', storeId: 'hillcrest' },
  { id: 'ben', name: 'Ben Okafor', storeId: 'hillcrest' },
]

export const MANAGER = { name: 'Lena Hart', title: 'Store manager' }

/**
 * Everyone who can sign in to the live version (docs/accounts-plan.md). Emails use
 * the reserved .test domain, so they can never reach a real inbox. Owen managed
 * Hillcrest before Marisol; his access is turned off, and his history stays.
 */
export const PEOPLE: Person[] = [
  { id: 'dana', name: 'Dana Whitfield', email: 'dana@lanternlane.test', role: 'admin', storeId: null, repId: null, status: 'active' },
  { id: 'lena', name: 'Lena Hart', email: 'lena@lanternlane.test', role: 'manager', storeId: 'riverside', repId: null, status: 'active' },
  { id: 'marisol', name: 'Marisol Vega', email: 'marisol@lanternlane.test', role: 'manager', storeId: 'hillcrest', repId: null, status: 'active' },
  { id: 'owen', name: 'Owen Price', email: 'owen@lanternlane.test', role: 'manager', storeId: 'hillcrest', repId: null, status: 'off' },
  ...REPS.map((r): Person => ({
    id: r.id,
    name: r.name,
    email: `${r.id}@lanternlane.test`,
    role: 'rep',
    storeId: r.storeId,
    repId: r.id,
    status: 'active',
  })),
]

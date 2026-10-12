// The made-up company: two stores, seven reps and a store manager.
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

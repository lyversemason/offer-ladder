// The pure parts of live mode (no database needed).
import { describe, expect, it } from 'vitest'
import { personFromRow, toQueryResult } from '../src/source/live'

describe('live mode', () => {
  it('turns report rows (JSON objects, columns in order) into the table the screens show', () => {
    expect(toQueryResult([{ month: '2026-04', rep: 'Tasha Ortiz', ups: 79 }, { month: '2026-05', rep: 'Tasha Ortiz', ups: null }])).toEqual({
      columns: ['month', 'rep', 'ups'],
      rows: [['2026-04', 'Tasha Ortiz', 79], ['2026-05', 'Tasha Ortiz', null]],
      truncated: false,
    })
    expect(toQueryResult([])).toEqual({ columns: [], rows: [], truncated: false })
  })

  it('turns a profile row into a person', () => {
    expect(
      personFromRow({ id: 'lena', name: 'Lena Hart', email: 'lena@lanternlane.test', role: 'manager', store_id: 'riverside', rep_id: null, status: 'active' }),
    ).toEqual({ id: 'lena', name: 'Lena Hart', email: 'lena@lanternlane.test', role: 'manager', storeId: 'riverside', repId: null, status: 'active' })
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv } from '../src/import/csv'

describe('CSV reader', () => {
  it('splits simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('keeps commas inside quotes', () => {
    expect(parseCsv('"$1,299.00",x')).toEqual([['$1,299.00', 'x']])
  })

  it('reads doubled quotes as one quote', () => {
    expect(parseCsv('"12"" pillow",y')).toEqual([['12" pillow', 'y']])
  })

  it('handles Windows line endings, a byte-order mark and no final newline', () => {
    expect(parseCsv('﻿a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('keeps empty fields and blank lines', () => {
    expect(parseCsv(',,x\n\n')).toEqual([['', '', 'x'], ['']])
  })

  it('reads the sample vendor sheet: a header plus 29 rows of 10 columns', () => {
    const rows = parseCsv(readFileSync(join(import.meta.dirname, '../src/data/samples/vendor-cost-sheet.csv'), 'utf8'))
    expect(rows).toHaveLength(30)
    for (const r of rows) expect(r).toHaveLength(10)
  })
})

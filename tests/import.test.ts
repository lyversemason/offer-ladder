import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { applyChanges, loadVendorSheet, runCleaningSteps } from '../src/import/pipeline'
import { createDatabase, readCatalog, seedCatalog } from '../src/db/database'
import { CATALOG } from '../src/data/catalog'

const sample = readFileSync(join(import.meta.dirname, '../src/data/samples/vendor-cost-sheet.csv'), 'utf8')
let db: Database

function all(sql: string): Record<string, unknown>[] {
  const res = db.exec(sql)
  if (!res.length) return []
  const { columns, values } = res[0]
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])))
}
const problemsFor = (item: string) => all(`SELECT level, problem FROM vendor_issues WHERE item = '${item}'`)

beforeAll(async () => {
  const SQL = await initSqlJs()
  db = createDatabase(SQL)
  seedCatalog(db, CATALOG)
  loadVendorSheet(db, sample)
  runCleaningSteps(db)
})

describe('vendor sheet import: cleaning steps', () => {
  it('loads every row as text first', () => {
    expect(all('SELECT COUNT(*) AS n FROM vendor_raw')[0].n).toBe(32)
  })

  it('sets aside the blank row and the repeated header', () => {
    const skipped = all("SELECT problem FROM vendor_issues WHERE level = 'skip'").map((r) => r.problem)
    expect(skipped).toEqual(expect.arrayContaining(['Blank row', 'The header row repeated (a page break in the export)']))
    expect(skipped).toHaveLength(2)
    expect(all('SELECT COUNT(*) AS n FROM vendor_rows')[0].n).toBe(30)
  })

  it('fills vendor, brand and category down from merged cells', () => {
    const r = all("SELECT vendor, brand, category FROM vendor_filled WHERE item = 'LRK-HP-K'")[0]
    expect(r).toEqual({ vendor: 'Northbay Sleep Co.', brand: 'Larkspur', category: 'Mattresses' })
    const after = all("SELECT vendor, brand FROM vendor_filled WHERE item = 'TDW-CP-K'")[0]
    expect(after).toEqual({ vendor: 'Tidewater Textiles', brand: 'Tidewell' })
  })

  it('trims stray spaces', () => {
    expect(all("SELECT product FROM vendor_filled WHERE item = 'LRK-HF-K'")[0].product).toBe('Hybrid Firm')
  })

  it('turns abbreviations into sizes', () => {
    const sizes = Object.fromEntries(all('SELECT item, size FROM vendor_normalized').map((r) => [r.item, r.size]))
    expect(sizes['LRK-HF-F']).toBe('Full')
    expect(sizes['LRK-HF-Q']).toBe('Queen')
    expect(sizes['TDW-CP-Q']).toBe('Queen')
    expect(sizes['TDW-CP-K']).toBe('King')
    expect(sizes['TDW-CG-TXL']).toBe('Twin XL')
    expect(sizes['LLH-DG-CK']).toBe('Cal King')
    expect(sizes['GLD-PR-SK']).toBe('Split King')
  })

  it('turns money text into whole cents, with or without $ and commas', () => {
    const r = all("SELECT cost_cents, retail_cents, floor_cost_cents FROM vendor_normalized WHERE item = 'LRK-HF-Q'")[0]
    expect(r).toEqual({ cost_cents: 89900, retail_cents: 199900, floor_cost_cents: 55738 })
    expect(all("SELECT cost_cents, retail_cents FROM vendor_normalized WHERE item = 'TDW-CG-Q'")[0]).toEqual({ cost_cents: 4200, retail_cents: 16900 })
  })

  it('flags each planted problem, and only those', () => {
    expect(problemsFor('LRK-HM-CK')).toEqual([{ level: 'block', problem: 'No retail price' }])
    expect(problemsFor('LRK-HP-Q-OLD')).toEqual([{ level: 'block', problem: 'Marked "do not use" by the vendor' }])
    expect(problemsFor('TDW-CG-TXL')).toEqual([{ level: 'warn', problem: 'Listed twice: only the first copy is used' }])
    expect(problemsFor('GLD-PR-Q')).toEqual([{ level: 'block', problem: 'Cost is at or above the retail price (probably a typo)' }])
    expect(problemsFor('LLH-CL-BODY')).toEqual([{ level: 'block', problem: 'Size "Body" isn\'t a size we know' }])
    expect(problemsFor('LLH-ES-Q')).toEqual([{ level: 'block', problem: 'A price or cost isn\'t a number' }])
    const noItem = all("SELECT problem FROM vendor_issues WHERE item = '' OR item IS NULL AND level <> 'skip'").map((r) => r.problem)
    expect(noItem).toContain("No item number, so it can't be matched to the catalog")
  })

  it('leaves the clean rows alone', () => {
    for (const item of ['LRK-HF-T', 'LRK-HF-Q', 'TDW-CP-Q', 'GLD-BS-K', 'LLH-DG-CK']) expect(problemsFor(item)).toEqual([])
  })

  it('reports a sheet missing a required column', () => {
    const res = loadVendorSheet(db, 'Vendor,Product,Size\nx,y,z\n')
    expect(res.missingColumns).toEqual(['cost', 'retail', 'item'])
  })
})

describe('vendor sheet import: compare and apply', () => {
  let db2: Database
  beforeAll(async () => {
    const SQL = await initSqlJs()
    db2 = createDatabase(SQL)
    seedCatalog(db2, CATALOG)
    loadVendorSheet(db2, sample)
    runCleaningSteps(db2)
    db = db2
  })

  it('labels each usable row new, changed or same', () => {
    const changes = Object.fromEntries(all('SELECT sku, change FROM vendor_changes').map((r) => [r.sku, r.change]))
    expect(changes['LRK-HF-Q']).toBe('same')
    expect(changes['LRK-HP-Q']).toBe('changed') // cost went from $989 to $949
    expect(changes['GLD-PR-K']).toBe('changed') // retail went from $1,799 to $1,849
    expect(changes['LLH-DG-CK']).toBe('new')
    expect(changes['TDW-CG-TXL']).toBe('new')
    expect(changes['GLD-PR-Q']).toBeUndefined() // blocked: cost above retail
    expect(changes['LRK-HP-Q-OLD']).toBeUndefined() // blocked: do not use
  })

  it('warns when a filled-down brand disagrees with the catalog', () => {
    expect(problemsFor('LLH-BZ-Q')).toEqual([
      { level: 'warn', problem: 'The sheet says brand Tidewell but the catalog has Lantern Lane: check the merged cells above it' },
    ])
  })

  it('applies only after approval, and then updates and adds', () => {
    expect(readCatalog(db2).find((p) => p.sku === 'LRK-HP-Q')?.costCents).toBe(98900)
    const before = readCatalog(db2).length
    const result = applyChanges(db2)
    const after = readCatalog(db2)
    expect(after.find((p) => p.sku === 'LRK-HP-Q')?.costCents).toBe(94900)
    expect(after.find((p) => p.sku === 'GLD-PR-K')?.listCents).toBe(184900)
    expect(after.find((p) => p.sku === 'LLH-DG-CK')).toMatchObject({ brand: 'Lantern Lane', category: 'protector', size: 'Cal King', listCents: 15900 })
    expect(after.length).toBe(before + result.added)
    expect(result.changed).toBeGreaterThanOrEqual(2)
  })

  it('reads the catalog back exactly as it was seeded', async () => {
    const SQL = await initSqlJs()
    const fresh = createDatabase(SQL)
    seedCatalog(fresh, CATALOG)
    expect(readCatalog(fresh)).toEqual(CATALOG)
  })
})

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
/** The problems found on one line of the sheet (the header is line 1). */
const problemsOn = (row: number) => all(`SELECT level, problem FROM vendor_issues WHERE row_no = ${row}`)
const one = (sql: string) => all(sql)[0]

beforeAll(async () => {
  const SQL = await initSqlJs()
  db = createDatabase(SQL)
  seedCatalog(db, CATALOG)
  loadVendorSheet(db, sample)
  runCleaningSteps(db)
})

describe('vendor sheet import: cleaning steps', () => {
  it('loads every row as text first', () => {
    expect(all('SELECT COUNT(*) AS n FROM vendor_raw')[0].n).toBe(29)
  })

  it('sets aside the blank row and the repeated header', () => {
    expect(all("SELECT row_no, problem FROM vendor_issues WHERE level = 'skip' ORDER BY row_no")).toEqual([
      { row_no: 12, problem: 'The header row repeated (a page break in the export)' },
      { row_no: 18, problem: 'Blank row' },
    ])
    expect(all('SELECT COUNT(*) AS n FROM vendor_rows')[0].n).toBe(27)
  })

  it('fills vendor, brand and category down from merged cells', () => {
    expect(one('SELECT vendor, brand, category FROM vendor_filled WHERE row_no = 8')).toEqual({
      vendor: 'Georgia Bedding Co.',
      brand: 'Georgia',
      category: 'Mattresses',
    })
    // A new group starts after the repeated header.
    expect(one('SELECT vendor, brand, category FROM vendor_filled WHERE row_no = 15')).toEqual({
      vendor: 'Cambria Motion',
      brand: 'Cambria',
      category: 'Adjustable Bases',
    })
  })

  it('trims stray spaces', () => {
    expect(one('SELECT product FROM vendor_filled WHERE row_no = 4').product).toBe('Clover Meadow Medium Hybrid')
  })

  it('turns abbreviations into sizes', () => {
    const sizes = Object.fromEntries(all('SELECT row_no, size FROM vendor_normalized').map((r) => [r.row_no, r.size]))
    expect(sizes[3]).toBe('Twin XL') // TXL
    expect(sizes[4]).toBe('Full') // F
    expect(sizes[7]).toBe('King') // KG
    expect(sizes[8]).toBe('Cal King') // Cal K
    expect(sizes[9]).toBe('Split-head King') // Spl Hd Kg
    expect(sizes[14]).toBe('King 1-piece') // King 1 PC
    expect(sizes[15]).toBe('Split Cal King half') // Dual Cal
    expect(sizes[29]).toBe('King / Cal King') // King/Cal
  })

  it('turns money text into whole cents, with or without $ and commas', () => {
    expect(one('SELECT cost_cents, retail_cents, outlet_cost_cents FROM vendor_normalized WHERE row_no = 6')).toEqual({
      cost_cents: 123900,
      retail_cents: 227999,
      outlet_cost_cents: 86880,
    })
    expect(one('SELECT cost_cents, retail_cents FROM vendor_normalized WHERE row_no = 22')).toEqual({ cost_cents: 2075, retail_cents: 5999 })
  })

  it('flags each planted problem, and only those', () => {
    expect(problemsOn(10)).toEqual([{ level: 'block', problem: 'No retail price' }])
    expect(problemsOn(11)).toEqual([{ level: 'block', problem: 'Marked "do not use" by the vendor' }])
    expect(problemsOn(17)).toEqual([{ level: 'block', problem: 'Cost is at or above the retail price (probably a typo)' }])
    expect(problemsOn(21)).toEqual([{ level: 'block', problem: 'Size "Body" isn\'t a size we know' }])
    expect(problemsOn(24)).toEqual([{ level: 'warn', problem: 'Listed twice: only the first copy is used' }])
    expect(problemsOn(26)).toEqual([{ level: 'block', problem: 'A price or cost isn\'t a number' }])
    expect(problemsOn(30)).toEqual([
      { level: 'block', problem: "No SKU, so it can't be matched to the catalog" },
      { level: 'block', problem: 'Size "Full XL" isn\'t a size we know' },
    ])
  })

  it('does not call two sizes of one SKU a duplicate', () => {
    for (const row of [2, 3, 4, 5, 13, 14, 15]) expect(problemsOn(row)).toEqual([])
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

  it('matches each row by SKU and size together, and labels it new, changed or same', () => {
    const changes = Object.fromEntries(all('SELECT row_no, sku, change FROM vendor_changes').map((r) => [r.row_no, `${r.sku} ${r.change}`]))
    expect(changes[2]).toBe('366238-T same')
    expect(changes[5]).toBe('366238-Q same') // a blank outlet cost means no change
    expect(changes[6]).toBe('366239-Q changed') // cost went from $1,267.19 to $1,239.00
    expect(changes[16]).toBe('366201-Q changed') // retail went from $1,679.99 to $1,749.99
    expect(changes[9]).toBe('366230-HK new') // a size the catalog didn't have: SKU + size code
    expect(changes[23]).toBe('366272-SK new')
    expect(changes[17]).toBeUndefined() // blocked: cost above retail
    expect(changes[24]).toBeUndefined() // the second copy
  })

  it('warns when a filled-down brand disagrees with the catalog', () => {
    const warning = { level: 'warn', problem: 'The sheet says brand Futura but the catalog has Meridian: check the merged cells above it' }
    expect(problemsOn(28)).toEqual([warning])
    expect(problemsOn(29)).toEqual([warning])
  })

  it('applies only after approval, and then updates and adds', () => {
    const find = (sku: string) => readCatalog(db2).find((p) => p.sku === sku)
    expect(find('366239-Q')?.costCents).toBe(126719)
    expect(find('366230-HK')).toBeUndefined()
    const before = readCatalog(db2).length
    const result = applyChanges(db2)
    expect(find('366239-Q')?.costCents).toBe(123900)
    expect(find('366201-Q')).toMatchObject({ listCents: 174999, outlet: { listCents: 139999, costCents: 36000 } }) // outlet = 20% off
    expect(find('366230-HK')).toMatchObject({ modelSku: '366230', brand: 'Georgia', category: 'mattress', size: 'Split-head King', listCents: 347999 })
    expect(find('366230-HK')?.outlet).toBeUndefined()
    expect(readCatalog(db2).length).toBe(before + result.added)
    expect(result).toEqual({ changed: 2, added: 2 })
  })

  it('reads the catalog back exactly as it was seeded', async () => {
    const SQL = await initSqlJs()
    const fresh = createDatabase(SQL)
    seedCatalog(fresh, CATALOG)
    expect(readCatalog(fresh)).toEqual(CATALOG)
  })
})

describe('step 6 in the live database (supabase/migrations)', () => {
  it('apply_catalog_changes runs step 6 exactly as written in src/import/steps/6-apply.sql', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const step6 = readFileSync(join(import.meta.dirname, '../src/import/steps/6-apply.sql'), 'utf8')
    const dir = join(import.meta.dirname, '../supabase/migrations')
    // The newest migration that defines apply_catalog_changes is the one in force.
    const latest = readdirSync(dir).sort().filter((f) => readFileSync(join(dir, f), 'utf8').includes('FUNCTION public.apply_catalog_changes(')).at(-1)!
    const migration = readFileSync(join(dir, latest), 'utf8')
    const code = (text: string) => text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--')).map((l) => l.trim())
    const body = code(migration.slice(migration.indexOf('FUNCTION public.apply_catalog_changes')))
    const lines = code(step6)
    const start = body.indexOf(lines[0])
    expect(start).toBeGreaterThan(0)
    expect(body.slice(start, start + lines.length)).toEqual(lines)
  })
})

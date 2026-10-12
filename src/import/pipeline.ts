// Runs a vendor cost sheet through the cleaning steps. TypeScript only reads the
// file and loads its rows; every cleaning decision is in the numbered .sql files,
// so each step can be read (and explained) on its own.
import type { Database } from 'sql.js'
import { parseCsv } from './csv'
import schema from './schema.sql?raw'
import skipJunk from './steps/1-skip-junk.sql?raw'
import fillDown from './steps/2-fill-down.sql?raw'
import normalize from './steps/3-normalize.sql?raw'
import flagProblems from './steps/4-flag-problems.sql?raw'
import compare from './steps/5-compare.sql?raw'
import apply from './steps/6-apply.sql?raw'

export const IMPORT_STEPS = [
  { id: 'skip-junk', title: 'Set aside rows that aren’t products', sql: skipJunk },
  { id: 'fill-down', title: 'Fill in the blanks left by merged cells', sql: fillDown },
  { id: 'normalize', title: 'Turn the vendor’s text into clean values', sql: normalize },
  { id: 'flag-problems', title: 'Flag every row a person needs to look at', sql: flagProblems },
  { id: 'compare', title: 'Compare the usable rows with the catalog', sql: compare },
]

/** Step 6, run only when the manager approves. */
export const APPLY_STEP = { id: 'apply', title: 'Apply the approved changes to the catalog', sql: apply }

/** The columns the sheet must have, in our order, matched to its header by name. */
const COLUMNS = ['vendor', 'brand', 'category', 'product', 'color', 'size', 'floor_cost', 'clearance_cost', 'cost', 'retail', 'item'] as const
const HEADER_NAMES: Record<string, (typeof COLUMNS)[number]> = {
  vendor: 'vendor', brand: 'brand', category: 'category', segment: 'category', product: 'product',
  color: 'color', type: 'color', size: 'size', 'floor cost': 'floor_cost', 'clearance cost': 'clearance_cost',
  'outlet cost': 'clearance_cost', cost: 'cost', retail: 'retail', 'retail price': 'retail', 'item #': 'item', sku: 'item', item: 'item',
}

export interface ImportStart {
  rows: number
  missingColumns: string[]
}

/** Creates the import tables and loads the file's rows, as text, into vendor_raw. */
export function loadVendorSheet(db: Database, csvText: string): ImportStart {
  db.run('DROP TABLE IF EXISTS vendor_raw; DROP TABLE IF EXISTS size_codes; DROP TABLE IF EXISTS category_codes; DROP TABLE IF EXISTS vendor_issues; DROP TABLE IF EXISTS vendor_rows; DROP TABLE IF EXISTS vendor_filled; DROP TABLE IF EXISTS vendor_normalized; DROP TABLE IF EXISTS vendor_changes;')
  db.run(schema)
  const [header = [], ...body] = parseCsv(csvText)
  const positions = new Map<string, number>()
  header.forEach((h, i) => {
    const col = HEADER_NAMES[h.trim().toLowerCase()]
    if (col && !positions.has(col)) positions.set(col, i)
  })
  const missingColumns = ['product', 'size', 'cost', 'retail', 'item'].filter((c) => !positions.has(c))
  if (missingColumns.length) return { rows: 0, missingColumns }
  const insert = db.prepare(`INSERT INTO vendor_raw (row_no, ${COLUMNS.join(', ')}) VALUES (?, ${COLUMNS.map(() => '?').join(', ')})`)
  body.forEach((cells, i) => {
    if (cells.length === 1 && cells[0] === '' && i === body.length - 1) return
    insert.run([i + 2, ...COLUMNS.map((c) => (positions.has(c) ? (cells[positions.get(c)!] ?? '') : ''))])
  })
  insert.free()
  return { rows: body.length, missingColumns: [] }
}

/** Runs every cleaning step in order. */
export function runCleaningSteps(db: Database) {
  for (const step of IMPORT_STEPS) db.run(step.sql)
}

/** Applies the reviewed changes (step 6). Returns how many items were updated and added. */
export function applyChanges(db: Database): { changed: number; added: number } {
  const count = (change: string) => Number(db.exec(`SELECT COUNT(*) FROM vendor_changes WHERE change = '${change}'`)[0].values[0][0])
  const changed = count('changed')
  const added = count('new')
  db.run(APPLY_STEP.sql)
  return { changed, added }
}

// Lets Node scripts import the report .sql files the way the app's build tool does
// (`import sql from './x.sql?raw'` gives the file's text). Used with
// `tsx --import ./scripts/sql-files.mjs`.
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

registerHooks({
  load(url, context, nextLoad) {
    const path = url.split('?')[0]
    if (path.startsWith('file:') && path.endsWith('.sql')) {
      const text = readFileSync(fileURLToPath(path), 'utf8')
      return { format: 'module', source: `export default ${JSON.stringify(text)}`, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

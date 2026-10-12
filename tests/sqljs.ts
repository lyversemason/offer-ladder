// Loads sql.js (SQLite) once for all database tests. In Node it finds its
// WebAssembly file in node_modules by itself.
import initSqlJs from 'sql.js'
import type { SqlJsStatic } from 'sql.js'
import { buildDemoDatabase } from '../src/data/history'

let SQL: SqlJsStatic | null = null

export async function loadSql(): Promise<SqlJsStatic> {
  SQL ??= await initSqlJs()
  return SQL
}

let demo: ReturnType<typeof buildDemoDatabase> | null = null

/** The full demo database, built once and shared (tests must only read it). */
export async function demoDatabase() {
  demo ??= buildDemoDatabase(await loadSql())
  return demo
}

import { initSQLite, getSQLite, closeSQLite } from './sqlite'
import { initLanceDB, getLanceDB, closeLanceDB } from './lance'
import type Database from 'better-sqlite3'
import type * as lancedb from '@lancedb/lancedb'

export async function initDatabases(): Promise<void> {
  await initSQLite()
  await initLanceDB()
  console.log('[DB] All databases initialized')
}

export function getDB(): { sqlite: Database.Database; lance: lancedb.Connection } {
  return {
    sqlite: getSQLite(),
    lance: getLanceDB()
  }
}

export async function closeDatabases(): Promise<void> {
  closeSQLite()
  await closeLanceDB()
  console.log('[DB] All databases closed')
}

export * from './sqlite'
export * from './lance'

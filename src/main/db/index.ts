import { initSQLite, getSQLite, closeSQLite } from './sqlite'
import { initLanceDB, getLanceDB, closeLanceDB } from './lance'
import { createLogger } from '../../shared/logger'
import type Database from 'better-sqlite3'
import type * as lancedb from '@lancedb/lancedb'

const log = createLogger('main/db')

export async function initDatabases(): Promise<void> {
  await initSQLite()
  await initLanceDB()
  log.info('All databases initialized')
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
  log.info('All databases closed')
}

export * from './sqlite'
export * from './lance'
export { runMigrations, getCurrentSchemaVersion, hasPendingMigrations } from './migrate'

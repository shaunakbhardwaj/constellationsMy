import Database from 'better-sqlite3'
import { getBrainDatabasePath } from '../brain-path'
import { runMigrations, getCurrentSchemaVersion } from './migrate'
import { createLogger } from '../../shared/logger'

let db: Database.Database | null = null

const log = createLogger('main/db/sqlite')

export async function initSQLite(): Promise<Database.Database> {
  if (db) return db

  const dbPath = getBrainDatabasePath()
  db = new Database(dbPath)

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL')
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON')

  // Run any pending migrations
  const migrationsApplied = runMigrations(db)
  const currentVersion = getCurrentSchemaVersion(db)

  log.info('Database initialized', { 
    path: dbPath, 
    schemaVersion: currentVersion,
    migrationsApplied 
  })
  
  return db
}

export function getSQLite(): Database.Database {
  if (!db) {
    throw new Error('[SQLite] Database not initialized')
  }
  return db
}

export function closeSQLite(): void {
  if (db) {
    db.close()
    db = null
    log.info('Database closed')
  }
}

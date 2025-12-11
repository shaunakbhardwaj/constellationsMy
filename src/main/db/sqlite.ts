import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import schemaFallback from './schema.sql?raw'
import { getBrainDatabasePath } from '../brain-path'

let db: Database.Database | null = null
let schemaSQL: string | null = null

/**
 * Load schema SQL lazily - uses async file read if possible,
 * falls back to sync read or bundled string
 */
async function loadSchemaSQL(): Promise<string> {
  if (schemaSQL) return schemaSQL

  try {
    const schemaUrl = new URL('./schema.sql', import.meta.url)
    const schemaPath = fileURLToPath(schemaUrl)
    if (existsSync(schemaPath)) {
      // Try async read first
      try {
        schemaSQL = await readFile(schemaPath, 'utf-8')
        return schemaSQL
      } catch {
        // Fall back to sync read if async fails
        schemaSQL = readFileSync(schemaPath, 'utf-8')
        return schemaSQL
      }
    }
  } catch (error) {
    console.warn('[SQLite] Failed to read schema file directly, falling back to bundled string.', error)
  }

  schemaSQL = schemaFallback
  return schemaSQL
}

export async function initSQLite(): Promise<Database.Database> {
  if (db) return db

  const dbPath = getBrainDatabasePath()
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')

  const schema = await loadSchemaSQL()
  db.exec(schema)

  console.log('[SQLite] Database initialized at:', dbPath)
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
    console.log('[SQLite] Database closed')
  }
}

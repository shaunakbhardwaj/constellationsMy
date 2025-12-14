import type Database from 'better-sqlite3'
import { createLogger } from '../../shared/logger'

const log = createLogger('main/db/migrations')

interface MigrationDefinition {
  version: number
  name: string
  sql: string
}

interface AppliedMigration {
  version: number
  name: string
  applied_at: number
}

/**
 * Embedded migrations - these are compiled into the code to avoid
 * filesystem path resolution issues with Electron bundling.
 * 
 * To add a new migration:
 * 1. Add a new object to this array with the next version number
 * 2. Use CREATE TABLE IF NOT EXISTS for new tables
 * 3. Use standard SQLite ALTER TABLE for schema changes
 */
const MIGRATIONS: MigrationDefinition[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
-- Migration 001: Initial Schema
-- Tracks every file/folder in the brain directory
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  relative_path TEXT NOT NULL,
  type TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  checksum TEXT,
  created_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  last_indexed_at INTEGER,
  indexed_status TEXT DEFAULT 'pending',
  error_message TEXT
);

-- Tracks individual chunks/embeddings
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  char_start INTEGER,
  char_end INTEGER,
  token_count INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(indexed_status);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
    `
  }
  // Add future migrations here:
  // {
  //   version: 2,
  //   name: 'add_model_embeddings',
  //   sql: `...`
  // }
]

/**
 * Ensure the schema_versions table exists
 */
function ensureVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)
}

/**
 * Get all applied migrations from the database
 */
function getAppliedMigrations(db: Database.Database): AppliedMigration[] {
  const rows = db.prepare(`
    SELECT version, name, applied_at FROM schema_versions ORDER BY version ASC
  `).all() as AppliedMigration[]
  
  return rows
}

/**
 * Apply a single migration within a transaction
 */
function applyMigration(db: Database.Database, migration: MigrationDefinition): void {
  log.info('Applying migration', { version: migration.version, name: migration.name })
  
  const runMigration = db.transaction(() => {
    // Execute the migration SQL
    db.exec(migration.sql)
    
    // Record the migration as applied
    db.prepare(`
      INSERT INTO schema_versions (version, name, applied_at) VALUES (?, ?, ?)
    `).run(migration.version, migration.name, Date.now())
  })
  
  runMigration()
  
  log.info('Migration applied successfully', { version: migration.version, name: migration.name })
}

/**
 * Run all pending migrations
 * @returns The number of migrations applied
 */
export function runMigrations(db: Database.Database): number {
  // Ensure we have the version tracking table
  ensureVersionTable(db)
  
  // Get applied migrations
  const applied = getAppliedMigrations(db)
  const appliedVersions = new Set(applied.map(m => m.version))
  
  // Find pending migrations from embedded list
  const pending = MIGRATIONS.filter(m => !appliedVersions.has(m.version))
  
  if (pending.length === 0) {
    const currentVersion = applied.length > 0 ? applied[applied.length - 1].version : 0
    log.info('Database schema up to date', { currentVersion, appliedCount: applied.length })
    return 0
  }
  
  log.info('Running pending migrations', { 
    pendingCount: pending.length, 
    versions: pending.map(m => m.version) 
  })
  
  // Apply each pending migration
  for (const migration of pending) {
    applyMigration(db, migration)
  }
  
  const newVersion = pending[pending.length - 1].version
  log.info('All migrations applied', { newVersion, appliedCount: pending.length })
  
  return pending.length
}

/**
 * Get the current schema version
 */
export function getCurrentSchemaVersion(db: Database.Database): number {
  ensureVersionTable(db)
  
  const row = db.prepare(`
    SELECT MAX(version) as version FROM schema_versions
  `).get() as { version: number | null } | undefined
  
  return row?.version ?? 0
}

/**
 * Check if there are pending migrations
 */
export function hasPendingMigrations(db: Database.Database): boolean {
  ensureVersionTable(db)
  
  const applied = getAppliedMigrations(db)
  const appliedVersions = new Set(applied.map(m => m.version))
  
  return MIGRATIONS.some(m => !appliedVersions.has(m.version))
}


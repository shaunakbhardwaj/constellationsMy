import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { createLogger } from '../../shared/logger'

type Migration = {
  version: number
  name: string
  filename: string
  filepath: string
  sql: string
}

const log = createLogger('main/db/migrate')
const MIGRATION_FILENAME = /^(\d+)_([a-z0-9_]+)\.sql$/i
const SCHEMA_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_versions (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  );
`

function ensureSchemaVersionsTable(db: Database.Database): void {
  db.exec(SCHEMA_TABLE_SQL)
}

function resolveMigrationsDir(): { dir: string | null; candidates: string[] } {
  const candidates = [
    join(__dirname, 'migrations'),
    join(process.cwd(), 'src', 'main', 'db', 'migrations')
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return { dir: candidate, candidates }
    }
  }

  return { dir: null, candidates }
}

function loadMigrations(): Migration[] {
  const { dir: migrationsDir, candidates } = resolveMigrationsDir()

  if (!migrationsDir) {
    log.warn('migrations directory not found', { candidates })
    return []
  }

  const files = readdirSync(migrationsDir)
  const migrations: Migration[] = []

  for (const filename of files) {
    if (!filename.endsWith('.sql')) continue
    const match = filename.match(MIGRATION_FILENAME)
    if (!match) {
      log.warn('skipping migration with invalid name', { filename })
      continue
    }

    const version = Number(match[1])
    const name = match[2]
    const filepath = join(migrationsDir, filename)
    const sql = readFileSync(filepath, 'utf-8')

    migrations.push({ version, name, filename, filepath, sql })
  }

  migrations.sort((a, b) => a.version - b.version)
  return migrations
}

function getAppliedVersions(db: Database.Database): Set<number> {
  ensureSchemaVersionsTable(db)
  const rows = db.prepare('SELECT version FROM schema_versions').all() as Array<{ version: number }>
  return new Set(rows.map((row) => row.version))
}

export function getCurrentSchemaVersion(db: Database.Database): number {
  ensureSchemaVersionsTable(db)
  const row = db
    .prepare('SELECT MAX(version) as version FROM schema_versions')
    .get() as { version?: number | null } | undefined
  return row?.version ?? 0
}

export function hasPendingMigrations(db: Database.Database): boolean {
  const migrations = loadMigrations()
  if (migrations.length === 0) return false
  const applied = getAppliedVersions(db)
  return migrations.some((migration) => !applied.has(migration.version))
}

export function runMigrations(db: Database.Database): number {
  ensureSchemaVersionsTable(db)
  const migrations = loadMigrations()
  if (migrations.length === 0) return 0

  const applied = getAppliedVersions(db)
  const insertStmt = db.prepare(
    'INSERT INTO schema_versions (version, name, applied_at) VALUES (?, ?, ?)'
  )

  const applyMigration = db.transaction((migration: Migration) => {
    const trimmed = migration.sql.trim()
    if (trimmed.length === 0) {
      log.warn('migration file is empty', { filename: migration.filename })
    } else {
      db.exec(migration.sql)
    }
    insertStmt.run(migration.version, migration.name, Date.now())
  })

  let appliedCount = 0
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue
    log.info('applying migration', { version: migration.version, name: migration.name })
    applyMigration(migration)
    appliedCount += 1
  }

  if (appliedCount > 0) {
    log.info('migrations applied', { count: appliedCount })
  }

  return appliedCount
}

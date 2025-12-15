import chokidar, { type FSWatcher } from 'chokidar'
import { relative } from 'path'
import { processFile, deleteFileEmbeddings } from './ingestion'
import { getSQLite, getLanceDB } from './db'
import { createLogger } from '../shared/logger'

let watcher: FSWatcher | null = null
const log = createLogger('main/watcher')

// File locking to prevent race conditions when same file triggers multiple events
const fileLocks = new Map<string, Promise<void>>()

async function withFileLock(filePath: string, fn: () => Promise<void>): Promise<void> {
  // Wait for any existing operation on this file
  const existingLock = fileLocks.get(filePath)

  const operation = (async () => {
    if (existingLock) {
      await existingLock.catch(() => {}) // Don't fail if previous operation failed
    }
    await fn()
  })()

  fileLocks.set(filePath, operation)

  try {
    await operation
  } finally {
    // Clean up the lock if it's still our operation
    if (fileLocks.get(filePath) === operation) {
      fileLocks.delete(filePath)
    }
  }
}

export function initWatcher(brainDir: string): void {
  if (watcher) return

  log.info('initWatcher start', { brainDir })

  watcher = chokidar.watch(brainDir, {
    ignored: [
      /(^|[/\\])\./, // Hidden files
      '**/*.db',
      '**/*.db-journal',
      '**/lance/**',
      '**/node_modules/**'
    ],
    persistent: true,
    ignoreInitial: true, // Initial state handled by scanner
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    },
    depth: 99
  })

  watcher
    .on('add', (path) => handleFileAdd(path, brainDir))
    .on('change', (path) => handleFileChange(path, brainDir))
    .on('unlink', (path) => handleFileDelete(path, brainDir))
    .on('error', (error) => log.error('watcher error', { error }))
    .on('ready', () => log.info('watcher ready'))
}

async function handleFileAdd(filePath: string, rootDir: string): Promise<void> {
  await withFileLock(filePath, async () => {
    const relativePath = relative(rootDir, filePath)
    log.info('file added', { relativePath, filePath })
    await processFile(filePath, relativePath)
  })
}

async function handleFileChange(filePath: string, rootDir: string): Promise<void> {
  await withFileLock(filePath, async () => {
    const relativePath = relative(rootDir, filePath)
    log.info('file changed', { relativePath, filePath })
    await processFile(filePath, relativePath)
  })
}

async function handleFileDelete(filePath: string, rootDir: string): Promise<void> {
  await withFileLock(filePath, async () => {
    const relativePath = relative(rootDir, filePath)
    log.info('file deleted', { relativePath, filePath })
    
    try {
      const db = getSQLite()
      
      // Step 1: Get file ID BEFORE deleting from SQLite
      const file = db.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as { id: string } | undefined
      
      if (!file) {
        log.warn('file not found in database for deletion', { filePath })
        return
      }
      
      const fileId = file.id
      log.info('deleting file from databases', { relativePath, fileId })
      
      // Step 2: Delete from LanceDB first (can fail, SQLite still has the record)
      try {
        await deleteFileEmbeddings(fileId)
        log.info('deleted embeddings from LanceDB', { relativePath, fileId })
      } catch (error) {
        // Log but continue - we should still delete from SQLite
        // The LanceDB entries become orphaned but won't cause issues
        log.error('failed to delete from LanceDB', { relativePath, fileId, error })
      }
      
      // Step 3: Delete from SQLite (this is the source of truth)
      // CASCADE delete will also remove chunks
      db.prepare('DELETE FROM files WHERE id = ?').run(fileId)
      log.info('deleted file record from SQLite', { relativePath, fileId })
      
    } catch (err) {
      log.error('failed to delete file record', { filePath, err })
    }
  })
}

export async function closeWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close()
    watcher = null
    log.info('watcher stopped')
  }
}

/**
 * Run orphan cleanup to find and delete LanceDB embeddings that no longer have
 * corresponding SQLite file records. This can happen if:
 * - The app crashed during file deletion
 * - LanceDB deletion failed previously
 * 
 * Call this periodically or on startup for maintenance.
 */
export async function runOrphanCleanup(): Promise<{ orphansDeleted: number }> {
  const db = getSQLite()
  const lance = getLanceDB()
  
  log.info('Starting orphan cleanup')
  
  try {
    const table = await lance.openTable('documents')
    
    // Get all unique file_ids from LanceDB
    // Note: LanceDB query syntax may vary by version
    const allDocs = await table.query().limit(100000).toArray()
    const lanceFileIds = new Set<string>(allDocs.map((doc: { file_id: string }) => doc.file_id))
    
    // Get all file IDs from SQLite
    const sqliteFiles = db.prepare('SELECT id FROM files').all() as { id: string }[]
    const sqliteFileIds = new Set<string>(sqliteFiles.map(f => f.id))
    
    // Find orphaned file IDs (in LanceDB but not in SQLite)
    const orphanedIds: string[] = []
    for (const fileId of lanceFileIds) {
      if (!sqliteFileIds.has(fileId)) {
        orphanedIds.push(fileId)
      }
    }
    
    if (orphanedIds.length === 0) {
      log.info('No orphaned embeddings found')
      return { orphansDeleted: 0 }
    }
    
    log.info('Found orphaned embeddings', { count: orphanedIds.length, fileIds: orphanedIds })
    
    // Delete orphaned embeddings
    for (const fileId of orphanedIds) {
      try {
        await table.delete(`file_id = '${fileId}'`)
        log.info('Deleted orphaned embeddings', { fileId })
      } catch (error) {
        log.error('Failed to delete orphaned embeddings', { fileId, error })
      }
    }
    
    log.info('Orphan cleanup complete', { orphansDeleted: orphanedIds.length })
    return { orphansDeleted: orphanedIds.length }
    
  } catch (error) {
    log.error('Orphan cleanup failed', { error })
    return { orphansDeleted: 0 }
  }
}


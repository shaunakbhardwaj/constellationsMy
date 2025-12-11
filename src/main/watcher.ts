import chokidar, { type FSWatcher } from 'chokidar'
import { relative } from 'path'
import { processFile } from './ingestion'
import { getSQLite } from './db'

let watcher: FSWatcher | null = null

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

  console.log('[Watcher] Starting file watch...')

  watcher = chokidar.watch(brainDir, {
    ignored: [
      /(^|[/\\])\../, // Hidden files
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
    .on('error', (error) => console.error('[Watcher] Error:', error))
    .on('ready', () => console.log('[Watcher] Ready'))
}

async function handleFileAdd(filePath: string, rootDir: string): Promise<void> {
  await withFileLock(filePath, async () => {
    const relativePath = relative(rootDir, filePath)
    console.log(`[Watcher] File added: ${relativePath}`)
    await processFile(filePath, relativePath)
  })
}

async function handleFileChange(filePath: string, rootDir: string): Promise<void> {
  await withFileLock(filePath, async () => {
    const relativePath = relative(rootDir, filePath)
    console.log(`[Watcher] File changed: ${relativePath}`)
    await processFile(filePath, relativePath)
  })
}

async function handleFileDelete(filePath: string, rootDir: string): Promise<void> {
  await withFileLock(filePath, async () => {
    const relativePath = relative(rootDir, filePath)
    console.log(`[Watcher] File deleted: ${relativePath}`)
    try {
      const db = getSQLite()
      db.prepare('DELETE FROM files WHERE path = ?').run(filePath)
    } catch (err) {
      console.error('[Watcher] Failed to delete record:', err)
    }
  })
}

export async function closeWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close()
    watcher = null
    console.log('[Watcher] Stopped')
  }
}

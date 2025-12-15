/**
 * Scanner - Parallel directory scanning with progress events
 */
import { readdir, stat } from 'fs/promises'
import { join, relative } from 'path'
import { EventEmitter } from 'events'
import { getSQLite } from './db'
import { processFile } from './ingestion'
import { createLogger } from '../shared/logger'

type FileInDB = {
  path: string
  modifiedAt: number
}

const log = createLogger('main/scanner')

// Concurrency limiter for parallel operations
const MAX_CONCURRENT_OPS = 10
const MAX_SCAN_DEPTH = 20

/**
 * Simple semaphore for concurrency control
 */
class Semaphore {
  private queue: (() => void)[] = []
  private running = 0

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.limit) {
      this.running++
      return
    }
    return new Promise(resolve => {
      this.queue.push(resolve)
    })
  }

  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) {
      this.running++
      next()
    }
  }
}

/**
 * Scanner event emitter for progress updates
 */
export const scannerEvents = new EventEmitter()

export interface ScanProgress {
  phase: 'scanning' | 'indexing' | 'complete'
  filesScanned: number
  filesTotal: number
  currentFile?: string
  newFiles: number
  updatedFiles: number
  deletedFiles: number
}

/**
 * Main scan function with parallelization and progress events
 */
export async function scanBrainDirectory(brainDir: string): Promise<void> {
  const startedAt = Date.now()
  log.info('scanBrainDirectory start', { brainDir })

  const db = getSQLite()

  // Fetch existing records for diffing
  const trackedFiles = db.prepare<[], FileInDB>('SELECT path, modified_at as modifiedAt FROM files').all()
  const trackedMap = new Map(trackedFiles.map((file) => [file.path, file.modifiedAt]))

  // Phase 1: Parallel directory scan
  scannerEvents.emit('progress', {
    phase: 'scanning',
    filesScanned: 0,
    filesTotal: 0,
    newFiles: 0,
    updatedFiles: 0,
    deletedFiles: 0
  } as ScanProgress)

  const filesOnDisk = await scanDirectoryParallel(brainDir)

  log.info('Scan complete, found files', { count: filesOnDisk.length })

  // Phase 2: Process files with concurrency control
  let newFiles = 0
  let updatedFiles = 0
  let processed = 0
  const semaphore = new Semaphore(MAX_CONCURRENT_OPS)

  // Get file stats in parallel
  const fileStatPromises = filesOnDisk.map(async (diskPath) => {
    const relativePath = relative(brainDir, diskPath)
    try {
      const stats = await stat(diskPath)
      return { diskPath, relativePath, mtime: Math.floor(stats.mtimeMs) }
    } catch {
      return null
    }
  })

  const fileStats = (await Promise.all(fileStatPromises)).filter(Boolean) as {
    diskPath: string
    relativePath: string
    mtime: number
  }[]

  // Process files that need indexing
  const filesToProcess: { diskPath: string; relativePath: string; isNew: boolean }[] = []

  for (const { diskPath, relativePath, mtime } of fileStats) {
    const dbModified = trackedMap.get(diskPath)

    if (!dbModified) {
      filesToProcess.push({ diskPath, relativePath, isNew: true })
    } else if (mtime > dbModified) {
      filesToProcess.push({ diskPath, relativePath, isNew: false })
    }

    trackedMap.delete(diskPath)
  }

  // Emit indexing phase start
  if (filesToProcess.length > 0) {
    scannerEvents.emit('progress', {
      phase: 'indexing',
      filesScanned: fileStats.length,
      filesTotal: filesToProcess.length,
      newFiles: 0,
      updatedFiles: 0,
      deletedFiles: 0
    } as ScanProgress)
  }

  // Process files in parallel with semaphore
  await Promise.all(
    filesToProcess.map(async ({ diskPath, relativePath, isNew }) => {
      await semaphore.acquire()
      try {
        if (isNew) {
          log.info('scan detected new file', { relativePath })
        } else {
          log.info('scan detected modified file', { relativePath })
        }

        await processFile(diskPath, relativePath)

        if (isNew) newFiles++
        else updatedFiles++

        processed++

        scannerEvents.emit('progress', {
          phase: 'indexing',
          filesScanned: fileStats.length,
          filesTotal: filesToProcess.length,
          currentFile: relativePath,
          newFiles,
          updatedFiles,
          deletedFiles: 0
        } as ScanProgress)
      } finally {
        semaphore.release()
      }
    })
  )

  // Handle deleted files
  const deletedCount = trackedMap.size
  for (const [deletedPath] of trackedMap) {
    const relativePath = relative(brainDir, deletedPath)
    log.info('scan detected deleted file', { relativePath })
    db.prepare('DELETE FROM files WHERE path = ?').run(deletedPath)
  }

  // Emit completion
  scannerEvents.emit('progress', {
    phase: 'complete',
    filesScanned: fileStats.length,
    filesTotal: filesToProcess.length,
    newFiles,
    updatedFiles,
    deletedFiles: deletedCount
  } as ScanProgress)

  log.info('scanBrainDirectory done', {
    brainDir,
    totalFiles: fileStats.length,
    newFiles,
    updatedFiles,
    deletedFiles: deletedCount,
    durationMs: Date.now() - startedAt
  })
}

/**
 * Parallel directory scanning using Promise.all for subdirectories
 */
async function scanDirectoryParallel(dir: string, depth = 0): Promise<string[]> {
  if (depth > MAX_SCAN_DEPTH) {
    log.warn('scanDirectory max depth reached', { MAX_SCAN_DEPTH, dir })
    return []
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true })

    const files: string[] = []
    const dirPromises: Promise<string[]>[] = []

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      // Skip hidden files, DBs, system folders, and symlinks
      if (shouldSkip(entry.name) || entry.isSymbolicLink()) {
        continue
      }

      if (entry.isDirectory()) {
        // Queue subdirectory scan for parallel execution
        dirPromises.push(scanDirectoryParallel(fullPath, depth + 1))
      } else if (entry.isFile()) {
        files.push(fullPath)
      }
    }

    // Wait for all subdirectory scans in parallel
    const nestedResults = await Promise.all(dirPromises)

    // Flatten results
    return [...files, ...nestedResults.flat()]
  } catch (err) {
    log.error('scanDirectory error', { dir, err })
    return []
  }
}

/**
 * Check if a file/folder should be skipped
 */
function shouldSkip(name: string): boolean {
  return (
    name.startsWith('.') ||
    name.endsWith('.db') ||
    name.endsWith('.db-journal') ||
    name.endsWith('.db-shm') ||
    name.endsWith('.db-wal') ||
    name === 'lance' ||
    name === 'node_modules' ||
    name === '__pycache__' ||
    name === '.git'
  )
}

/**
 * Export for backwards compatibility
 */
export { scanDirectoryParallel as scanDirectory }

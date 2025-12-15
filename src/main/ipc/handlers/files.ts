/**
 * IPC handler for file import operations.
 *
 * Handles the 'import-files' IPC channel for importing files into the brain directory.
 */

import { app, IpcMain } from 'electron'
import { promises as fs } from 'fs'
import { join, parse, relative, normalize, resolve, isAbsolute } from 'path'
import { getBrainDirectory } from '../../brain-path'
import { processFile } from '../../ingestion'
import { getLanceDB, getSQLite } from '../../db'
import { createLogger } from '../../../shared/logger'

const log = createLogger('ipc/files')

// Security: Maximum rename attempts to prevent infinite loops
const MAX_RENAME_ATTEMPTS = 1000
const DOCUMENT_TABLE = 'documents'

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type FileTransferPayload = {
  source: string
  destination: string
}

/**
 * Security: Validate that a path is within allowed directories
 * Prevents path traversal attacks and access to sensitive files
 */
function isPathSafe(filePath: string, allowedDirs: string[]): boolean {
  if (!isAbsolute(filePath)) {
    return false
  }

  const normalized = normalize(resolve(filePath))

  for (const allowed of allowedDirs) {
    const normalizedAllowed = normalize(resolve(allowed))
    if (normalized.startsWith(normalizedAllowed)) {
      return true
    }
  }

  return false
}

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * Copy a file or directory to the destination
 */
async function copyEntry(source: string, destination: string): Promise<void> {
  const stats = await fs.stat(source)

  if (stats.isDirectory()) {
    await fs.cp(source, destination, { recursive: true })
  } else {
    await fs.copyFile(source, destination)
  }
}

/**
 * Generate a unique destination path, appending a number suffix if needed
 */
async function ensureUniqueDestination(directory: string, baseName: string): Promise<string> {
  const parsed = parse(baseName)

  for (let attempt = 0; attempt < MAX_RENAME_ATTEMPTS; attempt++) {
    const suffix = attempt === 0 ? '' : `-${attempt}`
    const candidateName = `${parsed.name}${suffix}${parsed.ext}`
    const candidatePath = join(directory, candidateName)

    try {
      await fs.access(candidatePath)
      // File exists, continue to next attempt
    } catch {
      return candidatePath
    }
  }

  throw new Error(`Could not find unique name for ${baseName} after ${MAX_RENAME_ATTEMPTS} attempts`)
}

/**
 * Register file-related IPC handlers
 */
export function registerFileHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('import-files', async (_, payload: unknown) => {
    const startedAt = Date.now()
    const brainDirectory = getBrainDirectory()

    const normalized =
      Array.isArray(payload) || payload === undefined || payload === null
        ? {
            requestId: undefined as string | undefined,
            paths: payload as unknown,
            source: 'unknown' as const
          }
        : (payload as { requestId?: string; paths?: unknown; source?: unknown })

    const requestId =
      typeof normalized.requestId === 'string' && normalized.requestId.trim().length > 0
        ? normalized.requestId.trim()
        : undefined

    const source =
      normalized.source === 'drag-drop' ||
      normalized.source === 'file-picker' ||
      normalized.source === 'unknown'
        ? normalized.source
        : 'unknown'

    const filePaths = Array.isArray(normalized.paths) ? normalized.paths : payload

    log.info('import-files start', {
      requestId,
      source,
      payloadType: typeof payload,
      filePathsType: Array.isArray(filePaths) ? 'array' : typeof filePaths,
      filePathsLength: Array.isArray(filePaths) ? filePaths.length : undefined
    })

    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      log.warn('import-files invalid payload (no paths)', { requestId, source, payload })
      return { success: false, requestId, error: 'No files were provided.' }
    }

    // Security: Validate all paths before processing
    const allowedSourceDirs = [
      app.getPath('home'),
      app.getPath('documents'),
      app.getPath('downloads'),
      app.getPath('desktop')
    ]

    for (const rawPath of filePaths) {
      if (typeof rawPath !== 'string' || rawPath.trim().length === 0) continue
      if (!isPathSafe(rawPath, allowedSourceDirs)) {
        log.warn('import-files blocked unsafe path', {
          requestId,
          source,
          rawPath,
          allowedSourceDirs
        })
        return { success: false, requestId, error: `Access denied: ${rawPath}` }
      }
    }

    try {
      await fs.mkdir(brainDirectory, { recursive: true })
      const transfers: FileTransferPayload[] = []

      for (const rawPath of filePaths) {
        if (typeof rawPath !== 'string' || rawPath.trim().length === 0) continue
        const baseName = parse(rawPath).base
        if (!baseName) continue
        log.info('import-files processing path', { requestId, source, rawPath, baseName })

        const destination = await ensureUniqueDestination(brainDirectory, baseName)
        const copyStartedAt = Date.now()
        await copyEntry(rawPath, destination)
        log.info('import-files copied', {
          requestId,
          source,
          rawPath,
          destination,
          durationMs: Date.now() - copyStartedAt
        })

        const relPath = relative(brainDirectory, destination)
        const ingestionStartedAt = Date.now()
        await processFile(destination, relPath)
        log.info('import-files ingestion done', {
          requestId,
          source,
          destination,
          relativePath: relPath,
          durationMs: Date.now() - ingestionStartedAt
        })
        transfers.push({ source: rawPath, destination })
      }

      if (transfers.length === 0) {
        log.warn('import-files completed with zero transfers', { requestId, source, filePaths })
        return { success: false, requestId, error: 'No valid files could be processed.' }
      }

      log.info('import-files success', {
        requestId,
        source,
        transfersCount: transfers.length,
        durationMs: Date.now() - startedAt
      })
      return { success: true, requestId, files: transfers }
    } catch (error) {
      log.error('import-files failed', {
        requestId,
        source,
        durationMs: Date.now() - startedAt,
        error
      })
      return {
        success: false,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown file import error'
      }
    }
  })

  ipcMain.handle('delete-file', async (_, fileId: string) => {
    const startedAt = Date.now()
    log.info('delete-file start', { fileId })

    try {
      if (typeof fileId !== 'string' || fileId.trim().length === 0) {
        return { success: false, error: 'Invalid file id' }
      }

      if (!isValidUUID(fileId)) {
        return { success: false, error: 'Invalid file id' }
      }

      const db = getSQLite()
      const file = db
        .prepare<
          [string],
          { id: string; path: string; relativePath: string; indexedStatus: string | null }
        >(
          `
          SELECT
            id,
            path,
            relative_path AS relativePath,
            indexed_status AS indexedStatus
          FROM files
          WHERE id = ?
        `
        )
        .get(fileId)

      if (!file) {
        return { success: false, error: 'File not found' }
      }

      if (file.indexedStatus === 'processing') {
        return { success: false, error: 'File is currently being processed' }
      }

      const brainDirectory = getBrainDirectory()
      if (!isPathSafe(file.path, [brainDirectory])) {
        log.warn('delete-file blocked unsafe path', { fileId, filePath: file.path, brainDirectory })
        return { success: false, error: 'Access denied' }
      }

      const lance = getLanceDB()
      try {
        const table = await lance.openTable(DOCUMENT_TABLE)
        await table.delete(`file_id = '${fileId}'`)
        log.info('delete-file deleted vectors from LanceDB', { fileId })
      } catch (error) {
        log.warn('delete-file could not delete vectors from LanceDB', { fileId, error })
      }

      db.prepare('DELETE FROM files WHERE id = ?').run(fileId)
      log.info('delete-file deleted record from SQLite', { fileId })

      try {
        await fs.unlink(file.path)
        log.info('delete-file deleted file from disk', { fileId, filePath: file.path })
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        if (err.code !== 'ENOENT') {
          throw error
        }
        log.warn('delete-file file missing on disk (ignored)', { fileId, filePath: file.path })
      }

      log.info('delete-file success', { fileId, durationMs: Date.now() - startedAt })
      return { success: true }
    } catch (error) {
      log.error('delete-file failed', { fileId, durationMs: Date.now() - startedAt, error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete file'
      }
    }
  })
}

/**
 * IPC handler for brain data operations.
 *
 * Handles the 'fetch-brain-data' IPC channel for retrieving file listings.
 */

import { IpcMain } from 'electron'
import { getSQLite } from '../../db'
import { createLogger } from '../../../shared/logger'
import type { BrainFileRow } from '../../../shared/types'

const log = createLogger('ipc/brain')

/**
 * Register brain data IPC handlers
 */
export function registerBrainHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('fetch-brain-data', () => {
    try {
      const sqlite = getSQLite()
      const statement = sqlite.prepare<[], BrainFileRow>(`
        SELECT
          f.id AS id,
          f.path AS path,
          f.relative_path AS relativePath,
          f.type AS type,
          f.mime_type AS mimeType,
          f.size_bytes AS sizeBytes,
          f.created_at AS createdAt,
          f.modified_at AS modifiedAt,
          f.last_indexed_at AS lastIndexedAt,
          f.indexed_status AS indexedStatus,
          COUNT(c.id) AS chunkCount
        FROM files f
        LEFT JOIN chunks c ON c.file_id = f.id
        GROUP BY f.id
        ORDER BY f.created_at DESC
        LIMIT 500
      `)

      const files = statement.all()
      log.info('fetch-brain-data success', { fileCount: files.length })
      return { success: true, files }
    } catch (error) {
      log.error('fetch-brain-data failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown database error'
      }
    }
  })
}

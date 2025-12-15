/**
 * IPC handler for brain data operations.
 *
 * Handles the 'fetch-brain-data' IPC channel for retrieving file listings.
 */

import { IpcMain } from 'electron'
import { getSQLite } from '../../db'
import { createLogger } from '../../../shared/logger'
import { getEmbeddingModelStatuses, downloadEmbeddingModel } from '../../ai/model-manager'
import { getConfig, updateConfig } from '../../config'
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

  // Get embedding models with download status
  ipcMain.handle('get-embedding-models', () => {
    try {
      const models = getEmbeddingModelStatuses()
      const config = getConfig()
      const activeModelId = config.embedding.model

      log.info('get-embedding-models success', { count: models.length, activeModelId })
      return { success: true, models, activeModelId }
    } catch (error) {
      log.error('get-embedding-models failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get embedding models'
      }
    }
  })

  // Download an embedding model
  ipcMain.handle('download-embedding-model', async (_, modelId: string) => {
    try {
      log.info('download-embedding-model start', { modelId })
      await downloadEmbeddingModel(modelId)
      log.info('download-embedding-model success', { modelId })
      return { success: true }
    } catch (error) {
      log.error('download-embedding-model failed', { modelId, error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download model'
      }
    }
  })

  // Set active embedding model
  ipcMain.handle('set-active-embedding-model', (_, modelId: string) => {
    try {
      log.info('set-active-embedding-model', { modelId })

      const updated = updateConfig({
        embedding: { model: modelId }
      })

      log.info('set-active-embedding-model success', { modelId })
      return { success: true, config: updated }
    } catch (error) {
      log.error('set-active-embedding-model failed', { modelId, error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set active model'
      }
    }
  })
}


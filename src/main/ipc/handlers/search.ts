/**
 * IPC handler for search operations.
 *
 * Handles the 'search-brain' IPC channel for semantic search.
 */

import { IpcMain } from 'electron'
import { searchBrain } from '../../search'
import { createLogger } from '../../../shared/logger'

const log = createLogger('ipc/search')

/**
 * Register search-related IPC handlers
 */
export function registerSearchHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('search-brain', async (_, query: string) => {
    if (!query || query.trim().length === 0) {
      return { success: false, error: 'Query cannot be empty' }
    }

    const trimmedQuery = query.trim()
    log.info('search-brain start', { queryLength: trimmedQuery.length })

    try {
      const results = await searchBrain(trimmedQuery, 10)
      log.info('search-brain success', { resultsCount: results.length })
      return { success: true, results }
    } catch (error) {
      log.error('search-brain failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed'
      }
    }
  })
}

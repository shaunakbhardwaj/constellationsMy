/**
 * IPC handler for log operations.
 *
 * Provides access to log file information for debugging.
 */

import { IpcMain } from 'electron'
import { getLogFilePath } from '../../../shared/logger'
import { createLogger } from '../../../shared/logger'

const log = createLogger('ipc/logs')

/**
 * Register log-related IPC handlers
 */
export function registerLogHandlers(ipcMain: IpcMain): void {
  /**
   * Get the log file path
   */
  ipcMain.handle('get-log-path', () => {
    try {
      const logPath = getLogFilePath()
      log.info('get-log-path success', { logPath })
      return { success: true, path: logPath }
    } catch (error) {
      log.error('get-log-path failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get log path'
      }
    }
  })

  /**
   * Open logs folder in file explorer (platform-aware)
   */
  ipcMain.handle('open-logs-folder', async () => {
    try {
      const logPath = getLogFilePath()
      if (!logPath) {
        return { success: false, error: 'Log path not available' }
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { shell } = require('electron')
      const { dirname } = await import('path')
      const logsDir = dirname(logPath)

      await shell.openPath(logsDir)
      log.info('open-logs-folder success', { logsDir })
      return { success: true, path: logsDir }
    } catch (error) {
      log.error('open-logs-folder failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open logs folder'
      }
    }
  })
}

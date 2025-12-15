/**
 * IPC handler for configuration operations.
 *
 * Handles configuration get/set operations through IPC.
 */

import { IpcMain } from 'electron'
import { getConfig, updateConfig, resetConfig, getConfigFilePath } from '../../config'
import { createLogger } from '../../../shared/logger'
import type { AppConfig } from '../../config'

const log = createLogger('ipc/config')

/**
 * Register configuration IPC handlers
 */
export function registerConfigHandlers(ipcMain: IpcMain): void {
  /**
   * Get the current configuration
   */
  ipcMain.handle('get-config', () => {
    try {
      const config = getConfig()
      log.info('get-config success')
      return { success: true, config }
    } catch (error) {
      log.error('get-config failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get configuration'
      }
    }
  })

  /**
   * Update configuration with partial values
   */
  ipcMain.handle('set-config', async (_, partialConfig: Partial<AppConfig>) => {
    try {
      log.info('set-config start', { keys: Object.keys(partialConfig) })
      const updated = updateConfig(partialConfig)
      log.info('set-config success')
      return { success: true, config: updated }
    } catch (error) {
      log.error('set-config failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save configuration'
      }
    }
  })

  /**
   * Reset configuration to defaults
   */
  ipcMain.handle('reset-config', () => {
    try {
      log.info('reset-config start')
      const config = resetConfig()
      log.info('reset-config success')
      return { success: true, config }
    } catch (error) {
      log.error('reset-config failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reset configuration'
      }
    }
  })

  /**
   * Get the config file path (for debugging)
   */
  ipcMain.handle('get-config-path', () => {
    return { success: true, path: getConfigFilePath() }
  })
}

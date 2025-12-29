/**
 * IPC Handlers for API Key Storage
 */
import { ipcMain } from 'electron'
import { clearApiKey, getApiKey, saveApiKey } from '../../data/secrets'
import { createLogger } from '../../../shared/logger'

const log = createLogger('ipc/llm')

export function registerLLMHandlers(): void {
  ipcMain.handle('llm-get-api-key', async () => {
    try {
      const key = getApiKey('openrouter') ?? ''
      if (!key) {
        return { success: true, hasKey: false, maskedKey: '' }
      }
      const maskedKey = key.length <= 8 ? '••••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`
      return { success: true, hasKey: true, maskedKey }
    } catch (error) {
      log.error('llm-get-api-key failed', { error })
      return { success: false, error: 'Failed to get API key' }
    }
  })

  ipcMain.handle('llm-reveal-api-key', async () => {
    try {
      const key = getApiKey('openrouter') ?? ''
      if (!key) {
        return { success: true, hasKey: false, apiKey: '' }
      }
      return { success: true, hasKey: true, apiKey: key }
    } catch (error) {
      log.error('llm-reveal-api-key failed', { error })
      return { success: false, error: 'Failed to reveal API key' }
    }
  })

  ipcMain.handle('llm-set-api-key', async (_, apiKey: string) => {
    try {
      if (!apiKey || !apiKey.trim()) {
        return { success: false, error: 'API key is required' }
      }
      saveApiKey('openrouter', apiKey.trim())
      log.info('API key saved', { provider: 'openrouter' })
      return { success: true }
    } catch (error) {
      log.error('llm-set-api-key failed', { error })
      return { success: false, error: 'Failed to set API key' }
    }
  })

  ipcMain.handle('llm-clear-api-key', async () => {
    try {
      clearApiKey('openrouter')
      log.info('API key cleared', { provider: 'openrouter' })
      return { success: true }
    } catch (error) {
      log.error('llm-clear-api-key failed', { error })
      return { success: false, error: 'Failed to clear API key' }
    }
  })

  log.info('API key handlers registered')
}

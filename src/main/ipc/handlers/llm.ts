/**
 * IPC Handlers for LLM Configuration
 */
import { ipcMain } from 'electron'
import { safeStorage } from 'electron'
import { getLLMService } from '../../llm'
import { getOpenRouterClient } from '../../llm/openrouter'
import { DEFAULT_LLM_MODELS } from '../../llm/types'
import { createLogger } from '../../../shared/logger'

const log = createLogger('ipc/llm')

// Store API key in memory (encrypted in safeStorage when available)
let encryptedApiKey: Buffer | null = null

export function registerLLMHandlers(): void {
  const llmService = getLLMService()
  const client = getOpenRouterClient()

  // Get available LLM models
  ipcMain.handle('llm-get-models', async () => {
    try {
      return { success: true, models: DEFAULT_LLM_MODELS }
    } catch (error) {
      log.error('llm-get-models failed', { error })
      return { success: false, error: 'Failed to get models' }
    }
  })

  // Get current LLM configuration
  ipcMain.handle('llm-get-config', async () => {
    try {
      return {
        success: true,
        config: {
          hasApiKey: client.hasApiKey(),
          model: llmService.getModel(),
          isReady: llmService.isReady()
        }
      }
    } catch (error) {
      log.error('llm-get-config failed', { error })
      return { success: false, error: 'Failed to get config' }
    }
  })

  // Set API key (securely stored)
  ipcMain.handle('llm-set-api-key', async (_, apiKey: string) => {
    try {
      // Validate key first
      client.setApiKey(apiKey)
      const isValid = await client.validateApiKey()

      if (!isValid) {
        return { success: false, error: 'Invalid API key' }
      }

      // Store encrypted if safeStorage is available
      if (safeStorage.isEncryptionAvailable()) {
        encryptedApiKey = safeStorage.encryptString(apiKey)
        log.info('API key stored securely')
      } else {
        log.warn('safeStorage not available, key stored in memory only')
      }

      return { success: true }
    } catch (error) {
      log.error('llm-set-api-key failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set API key'
      }
    }
  })

  // Clear API key
  ipcMain.handle('llm-clear-api-key', async () => {
    try {
      encryptedApiKey = null
      // Create new client instance to clear key
      const newClient = getOpenRouterClient()
      newClient.setApiKey('')
      log.info('API key cleared')
      return { success: true }
    } catch (error) {
      log.error('llm-clear-api-key failed', { error })
      return { success: false, error: 'Failed to clear API key' }
    }
  })

  // Set model
  ipcMain.handle('llm-set-model', async (_, modelId: string) => {
    try {
      llmService.setModel(modelId)
      log.info('Model set', { model: modelId })
      return { success: true }
    } catch (error) {
      log.error('llm-set-model failed', { error })
      return { success: false, error: 'Failed to set model' }
    }
  })

  // Test LLM connection
  ipcMain.handle('llm-test', async () => {
    try {
      if (!llmService.isReady()) {
        return { success: false, error: 'LLM not configured' }
      }

      const response = await llmService.chat([
        { role: 'user', content: 'Say "Hello" in one word.' }
      ])

      return { success: true, response }
    } catch (error) {
      log.error('llm-test failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Test failed'
      }
    }
  })

  log.info('LLM handlers registered')
}

/**
 * Load API key from secure storage on startup
 */
export function loadStoredApiKey(): void {
  if (encryptedApiKey && safeStorage.isEncryptionAvailable()) {
    try {
      const apiKey = safeStorage.decryptString(encryptedApiKey)
      const client = getOpenRouterClient()
      client.setApiKey(apiKey)
      log.info('API key loaded from secure storage')
    } catch (error) {
      log.error('Failed to load API key from secure storage', { error })
    }
  }
}

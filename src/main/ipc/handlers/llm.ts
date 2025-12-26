/**
 * IPC Handlers for LLM Configuration
 *
 * Handles API key storage, model selection, and LLM testing.
 */
import { ipcMain } from 'electron'
import { getLLMService } from '../../llm'
import { getOpenRouterClient } from '../../llm/openrouter'
import {
  saveApiKey,
  getApiKey,
  hasApiKey,
  clearApiKey,
  getApiKeyStatus,
  type ApiKeyProvider
} from '../../config/secrets'
import { OPENROUTER_MODELS } from '../../models/llm-openrouter'
import { GEMINI_MODELS } from '../../models/llm-gemini'
import { createLogger } from '../../../shared/logger'

const log = createLogger('ipc/llm')

export function registerLLMHandlers(): void {
  const llmService = getLLMService()
  const openRouterClient = getOpenRouterClient()

  // Get available LLM models for a provider
  ipcMain.handle('llm-get-models', async (_, provider?: 'openrouter' | 'gemini') => {
    try {
      if (provider === 'gemini') {
        return { success: true, models: GEMINI_MODELS }
      }
      // Default to OpenRouter
      return { success: true, models: OPENROUTER_MODELS }
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
          hasOpenRouterKey: hasApiKey('openrouter'),
          hasGeminiKey: hasApiKey('gemini'),
          model: llmService.getModel(),
          isReady: llmService.isReady()
        }
      }
    } catch (error) {
      log.error('llm-get-config failed', { error })
      return { success: false, error: 'Failed to get config' }
    }
  })

  // Get API key status for all providers
  ipcMain.handle('llm-get-key-status', async () => {
    try {
      return { success: true, status: getApiKeyStatus() }
    } catch (error) {
      log.error('llm-get-key-status failed', { error })
      return { success: false, error: 'Failed to get key status' }
    }
  })

  // Get stored API key (masked) for a provider
  ipcMain.handle('llm-get-api-key', async (_, provider: ApiKeyProvider = 'openrouter') => {
    try {
      const key = getApiKey(provider) ?? ''
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

  // Reveal stored API key for a provider (explicit user action)
  ipcMain.handle('llm-reveal-api-key', async (_, provider: ApiKeyProvider = 'openrouter') => {
    try {
      const key = getApiKey(provider) ?? ''
      if (!key) {
        return { success: true, hasKey: false, apiKey: '' }
      }
      return { success: true, hasKey: true, apiKey: key }
    } catch (error) {
      log.error('llm-reveal-api-key failed', { error })
      return { success: false, error: 'Failed to reveal API key' }
    }
  })

  // Set API key (securely stored)
  ipcMain.handle(
    'llm-set-api-key',
    async (_, apiKey: string, provider: ApiKeyProvider = 'openrouter') => {
      try {
        // For OpenRouter, validate key first
        if (provider === 'openrouter') {
          openRouterClient.setApiKey(apiKey)
          const isValid = await openRouterClient.validateApiKey()

          if (!isValid) {
            openRouterClient.setApiKey('') // Clear invalid key from client
            return { success: false, error: 'Invalid API key' }
          }
        }

        // Store securely
        saveApiKey(provider, apiKey)

        // For OpenRouter, also set on the client
        if (provider === 'openrouter') {
          openRouterClient.setApiKey(apiKey)
        }

        log.info('API key saved', { provider })
        return { success: true }
      } catch (error) {
        log.error('llm-set-api-key failed', { error, provider })
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set API key'
        }
      }
    }
  )

  // Clear API key
  ipcMain.handle('llm-clear-api-key', async (_, provider: ApiKeyProvider = 'openrouter') => {
    try {
      clearApiKey(provider)

      // For OpenRouter, also clear from client
      if (provider === 'openrouter') {
        openRouterClient.setApiKey('')
      }

      log.info('API key cleared', { provider })
      return { success: true }
    } catch (error) {
      log.error('llm-clear-api-key failed', { error, provider })
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

      const response = await llmService.chat([{ role: 'user', content: 'Say "Hello" in one word.' }])

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
 * Initialize LLM with stored API key (call on app startup)
 */
export function initializeLLMFromStorage(): void {
  const openRouterKey = getApiKey('openrouter')
  if (openRouterKey) {
    const client = getOpenRouterClient()
    client.setApiKey(openRouterKey)
    log.info('OpenRouter API key loaded from secure storage')
  }
}

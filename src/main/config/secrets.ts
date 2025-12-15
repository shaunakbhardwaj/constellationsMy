/**
 * Secure API Key Storage
 *
 * Uses Electron's safeStorage to encrypt API keys at rest.
 * Keys are stored in an encrypted file and loaded on app startup.
 */

import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { createLogger } from '../../shared/logger'

const log = createLogger('main/config/secrets')

// Supported API key providers
export type ApiKeyProvider = 'openrouter' | 'gemini'

// In-memory store for decrypted keys (never written to disk unencrypted)
const keyStore: Record<ApiKeyProvider, string | null> = {
  openrouter: null,
  gemini: null
}

/**
 * Get the path to the encrypted secrets file
 */
function getSecretsFilePath(): string {
  const configDir = join(app.getPath('home'), '.constellations')
  return join(configDir, 'secrets.enc')
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDirectory(): void {
  const secretsPath = getSecretsFilePath()
  const dir = dirname(secretsPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Load encrypted secrets from disk and decrypt them
 * Should be called on app startup
 */
export function loadApiKeys(): void {
  const secretsPath = getSecretsFilePath()

  if (!existsSync(secretsPath)) {
    log.info('No secrets file found, starting fresh')
    return
  }

  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('safeStorage encryption not available, cannot load secrets')
    return
  }

  try {
    const encryptedData = readFileSync(secretsPath)
    const decryptedJson = safeStorage.decryptString(encryptedData)
    const secrets = JSON.parse(decryptedJson) as Record<string, string>

    // Load into memory
    if (secrets.openrouter) {
      keyStore.openrouter = secrets.openrouter
      log.info('Loaded OpenRouter API key from secure storage')
    }
    if (secrets.gemini) {
      keyStore.gemini = secrets.gemini
      log.info('Loaded Gemini API key from secure storage')
    }
  } catch (error) {
    log.error('Failed to load secrets', { error })
  }
}

/**
 * Save all keys to encrypted file
 */
function saveKeysToFile(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('safeStorage not available, keys stored in memory only')
    return
  }

  ensureConfigDirectory()

  const secrets: Record<string, string> = {}
  if (keyStore.openrouter) secrets.openrouter = keyStore.openrouter
  if (keyStore.gemini) secrets.gemini = keyStore.gemini

  try {
    const jsonData = JSON.stringify(secrets)
    const encryptedData = safeStorage.encryptString(jsonData)
    writeFileSync(getSecretsFilePath(), encryptedData)
    log.info('Saved secrets to encrypted file')
  } catch (error) {
    log.error('Failed to save secrets', { error })
  }
}

/**
 * Save an API key for a provider
 */
export function saveApiKey(provider: ApiKeyProvider, key: string): void {
  keyStore[provider] = key
  saveKeysToFile()
  log.info('API key saved', { provider })
}

/**
 * Get an API key for a provider
 */
export function getApiKey(provider: ApiKeyProvider): string | null {
  return keyStore[provider]
}

/**
 * Check if an API key exists for a provider
 */
export function hasApiKey(provider: ApiKeyProvider): boolean {
  return Boolean(keyStore[provider])
}

/**
 * Clear an API key for a provider
 */
export function clearApiKey(provider: ApiKeyProvider): void {
  keyStore[provider] = null
  saveKeysToFile()
  log.info('API key cleared', { provider })
}

/**
 * Get status of all API keys
 */
export function getApiKeyStatus(): Record<ApiKeyProvider, boolean> {
  return {
    openrouter: hasApiKey('openrouter'),
    gemini: hasApiKey('gemini')
  }
}

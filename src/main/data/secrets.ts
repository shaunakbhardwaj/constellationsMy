/**
 * Secure API Key Storage
 *
 * Uses Electron's safeStorage to encrypt API keys at rest.
 */
import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { createLogger } from '../../shared/logger'

const log = createLogger('main/data/secrets')

export type ApiKeyProvider = 'openrouter'

const keyStore: Record<ApiKeyProvider, string | null> = {
  openrouter: null
}

function getSecretsFilePath(): string {
  const configDir = join(app.getPath('home'), '.constellations')
  return join(configDir, 'secrets.enc')
}

function ensureConfigDirectory(): void {
  const secretsPath = getSecretsFilePath()
  const dir = dirname(secretsPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

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

    if (secrets.openrouter) {
      keyStore.openrouter = secrets.openrouter
      log.info('Loaded OpenRouter API key from secure storage')
    }
  } catch (error) {
    log.error('Failed to load secrets', { error })
  }
}

function saveKeysToFile(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('safeStorage not available, keys stored in memory only')
    return
  }

  ensureConfigDirectory()

  const secrets: Record<string, string> = {}
  if (keyStore.openrouter) secrets.openrouter = keyStore.openrouter

  try {
    const jsonData = JSON.stringify(secrets)
    const encryptedData = safeStorage.encryptString(jsonData)
    writeFileSync(getSecretsFilePath(), encryptedData)
    log.info('Saved secrets to encrypted file')
  } catch (error) {
    log.error('Failed to save secrets', { error })
  }
}

export function saveApiKey(provider: ApiKeyProvider, key: string): void {
  keyStore[provider] = key
  saveKeysToFile()
  log.info('API key saved', { provider })
}

export function getApiKey(provider: ApiKeyProvider): string | null {
  return keyStore[provider]
}

export function clearApiKey(provider: ApiKeyProvider): void {
  keyStore[provider] = null
  saveKeysToFile()
  log.info('API key cleared', { provider })
}

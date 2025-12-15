/**
 * Configuration Manager
 *
 * Handles loading, saving, and accessing application configuration.
 * Configuration is stored in ~/.constellations/config.json
 */

import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { AppConfig, DEFAULT_CONFIG, validateConfig } from './schema'

// Export types for external use
export type { AppConfig, IngestionConfig, EmbeddingConfig, LoggingConfig } from './schema'
export { DEFAULT_CONFIG } from './schema'

let cachedConfig: AppConfig | null = null

/**
 * Get the configuration directory path
 */
export function getConfigDirectory(): string {
  return join(app.getPath('home'), '.constellations')
}

/**
 * Get the configuration file path
 */
export function getConfigFilePath(): string {
  return join(getConfigDirectory(), 'config.json')
}

/**
 * Ensure the configuration directory exists
 */
function ensureConfigDirectory(): void {
  const dir = getConfigDirectory()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Get the default brain directory path
 */
function getDefaultBrainDirectory(): string {
  return join(app.getPath('home'), 'Work', 'brain')
}

/**
 * Load configuration from disk
 * Returns cached config if already loaded
 */
export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const configPath = getConfigFilePath()

  let rawConfig: unknown = null

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8')
      rawConfig = JSON.parse(content)
    } catch (error) {
      console.error('[Config] Failed to load config file, using defaults:', error)
    }
  }

  // Validate and merge with defaults
  const config = validateConfig(rawConfig)

  // Set default brain directory if not specified
  if (!config.brainDirectory) {
    config.brainDirectory = getDefaultBrainDirectory()
  }

  cachedConfig = config
  return config
}

/**
 * Save configuration to disk
 */
export function saveConfig(config: AppConfig): void {
  ensureConfigDirectory()

  const validated = validateConfig(config)
  const configPath = getConfigFilePath()

  try {
    writeFileSync(configPath, JSON.stringify(validated, null, 2), 'utf-8')
    cachedConfig = validated
  } catch (error) {
    console.error('[Config] Failed to save config:', error)
    throw error
  }
}

/**
 * Get the current configuration
 * Loads from disk if not already cached
 */
export function getConfig(): AppConfig {
  return loadConfig()
}

/**
 * Update a partial configuration
 * Merges with existing config and saves
 */
export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  const current = loadConfig()

  const updated: AppConfig = {
    brainDirectory: partial.brainDirectory ?? current.brainDirectory,
    ingestion: {
      ...current.ingestion,
      ...(partial.ingestion ?? {})
    },
    embedding: {
      ...current.embedding,
      ...(partial.embedding ?? {})
    },
    logging: {
      ...current.logging,
      ...(partial.logging ?? {})
    }
  }

  saveConfig(updated)
  return updated
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): AppConfig {
  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    brainDirectory: getDefaultBrainDirectory()
  }
  saveConfig(config)
  return config
}

/**
 * Clear the cached configuration (for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null
}

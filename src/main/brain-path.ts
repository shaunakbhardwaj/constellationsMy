/**
 * Brain Path Configuration
 *
 * Provides paths for the brain directory and related data stores.
 * Now uses the configuration system for the brain directory path.
 */

import { mkdirSync } from 'fs'
import { join } from 'path'
import { getConfig } from './config'

function ensureDirectory(path: string): string {
  mkdirSync(path, { recursive: true })
  return path
}

/**
 * Get the brain directory path from configuration
 */
export function getBrainDirectory(): string {
  return getConfig().brainDirectory
}

/**
 * Ensure the brain directory exists and return its path
 */
export function ensureBrainDirectory(): string {
  return ensureDirectory(getBrainDirectory())
}

/**
 * Get the path to the brain SQLite database
 */
export function getBrainDatabasePath(): string {
  return join(ensureBrainDirectory(), 'brain.db')
}

/**
 * Get the path to the LanceDB directory
 */
export function ensureLanceDirectory(): string {
  return ensureDirectory(join(ensureBrainDirectory(), 'lance'))
}

import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'

function ensureDirectory(path: string): string {
  mkdirSync(path, { recursive: true })
  return path
}

export function getBrainDirectory(): string {
  return join(app.getPath('home'), 'Work', 'brain')
}

export function ensureBrainDirectory(): string {
  return ensureDirectory(getBrainDirectory())
}

export function getBrainDatabasePath(): string {
  return join(ensureBrainDirectory(), 'brain.db')
}

export function ensureLanceDirectory(): string {
  return ensureDirectory(join(ensureBrainDirectory(), 'lance'))
}

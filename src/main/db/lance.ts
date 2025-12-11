import * as lancedb from '@lancedb/lancedb'
import { ensureLanceDirectory } from '../brain-path'

let connection: lancedb.Connection | null = null

export async function initLanceDB(): Promise<lancedb.Connection> {
  if (connection) return connection

  const lanceDir = ensureLanceDirectory()
  connection = await lancedb.connect(lanceDir)

  console.log('[LanceDB] Connected at:', lanceDir)
  return connection
}

export function getLanceDB(): lancedb.Connection {
  if (!connection) {
    throw new Error('[LanceDB] Not initialized')
  }
  return connection
}

export async function closeLanceDB(): Promise<void> {
  if (connection) {
    // LanceDB Connection may have a close method depending on version
    // Check for it dynamically to ensure proper cleanup
    const conn = connection as unknown as { close?: () => Promise<void> }
    if (typeof conn.close === 'function') {
      try {
        await conn.close()
        console.log('[LanceDB] Connection properly closed')
      } catch (error) {
        console.warn('[LanceDB] Error during close:', error)
      }
    }
    connection = null
    console.log('[LanceDB] Connection released')
  }
}

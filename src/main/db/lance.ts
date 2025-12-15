import * as lancedb from '@lancedb/lancedb'
import { ensureLanceDirectory } from '../brain-path'
import { createLogger } from '../../shared/logger'

let connection: lancedb.Connection | null = null

const log = createLogger('main/db/lance')

export async function initLanceDB(): Promise<lancedb.Connection> {
  if (connection) return connection

  const lanceDir = ensureLanceDirectory()
  connection = await lancedb.connect(lanceDir)

  log.info('Connected', { path: lanceDir })
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
        log.info('Connection properly closed')
      } catch (error) {
        log.warn('Error during close', { error })
      }
    }
    connection = null
    log.info('Connection released')
  }
}


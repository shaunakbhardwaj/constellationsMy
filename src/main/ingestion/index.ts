import { promises as fs } from 'fs'
import { extname } from 'path'
import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type Database from 'better-sqlite3'
import type * as lancedb from '@lancedb/lancedb'
import { getSQLite, getLanceDB } from '../db'
import { getConfig } from '../config'
import { splitTextIntoChunks } from './splitter'
import { extractPdfText } from './pdf'
import { generateEmbeddingsInWorker } from '../workers/worker-manager'
import { createLogger } from '../../shared/logger'

const log = createLogger('main/ingestion')
const DOCUMENT_TABLE = 'documents'

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.html',
  '.css',
  '.csv',
  '.yml',
  '.yaml'
])

type ExistingFileRow = {
  id: string
  createdAt: number
}

type ChunkRow = {
  id: string
  fileId: string
  chunkIndex: number
  text: string
  charStart: number | null
  charEnd: number | null
  tokenCount: number | null
  createdAt: number
}

function getMimeType(extension: string): string | null {
  switch (extension) {
    case '.txt':
      return 'text/plain'
    case '.md':
    case '.markdown':
      return 'text/markdown'
    case '.json':
      return 'application/json'
    case '.js':
      return 'application/javascript'
    case '.jsx':
      return 'text/jsx'
    case '.ts':
      return 'text/typescript'
    case '.tsx':
      return 'text/tsx'
    case '.html':
      return 'text/html'
    case '.css':
      return 'text/css'
    case '.csv':
      return 'text/csv'
    case '.yml':
    case '.yaml':
      return 'text/yaml'
    case '.pdf':
      return 'application/pdf'
    default:
      return null
  }
}

function getExistingFile(db: Database.Database, filePath: string): ExistingFileRow | undefined {
  return db
    .prepare<[string], ExistingFileRow>('SELECT id, created_at AS createdAt FROM files WHERE path = ?')
    .get(filePath)
}

function upsertProcessingFile(
  db: Database.Database,
  fileId: string,
  filePath: string,
  relativePath: string,
  createdAt: number,
  modifiedAt: number,
  sizeBytes: number,
  mimeType: string | null
): void {
  const existing = db.prepare('SELECT id FROM files WHERE id = ?').get(fileId) as { id: string } | undefined

  if (existing) {
    db.prepare(
      `
      UPDATE files
      SET
        relative_path = ?,
        type = ?,
        mime_type = ?,
        size_bytes = ?,
        modified_at = ?,
        indexed_status = ?,
        error_message = NULL
      WHERE id = ?
    `
    ).run(relativePath, 'file', mimeType, sizeBytes, modifiedAt, 'processing', fileId)
  } else {
    db.prepare(
      `
      INSERT INTO files (
        id,
        path,
        relative_path,
        type,
        mime_type,
        size_bytes,
        created_at,
        modified_at,
        indexed_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      fileId,
      filePath,
      relativePath,
      'file',
      mimeType,
      sizeBytes,
      createdAt,
      modifiedAt,
      'processing'
    )
  }
}

function updateFileStatus(
  db: Database.Database,
  fileId: string,
  status: string,
  errorMessage: string | null,
  checksum: string | null
): void {
  db.prepare(
    `
    UPDATE files
    SET
      indexed_status = ?,
      error_message = ?,
      last_indexed_at = ?,
      checksum = ?
    WHERE id = ?
  `
  ).run(status, errorMessage, Date.now(), checksum, fileId)
}

async function openDocumentsTable(
  lance: lancedb.Connection,
  initialRows?: Record<string, unknown>[]
): Promise<{ table: lancedb.Table; createdWithInitialRows: boolean }> {
  try {
    return { table: await lance.openTable(DOCUMENT_TABLE), createdWithInitialRows: false }
  } catch (error) {
    if (!initialRows || initialRows.length === 0) {
      throw error
    }
    try {
      const table = await lance.createTable(DOCUMENT_TABLE, initialRows, { mode: 'create', existOk: true })
      return { table, createdWithInitialRows: true }
    } catch {
      return { table: await lance.openTable(DOCUMENT_TABLE), createdWithInitialRows: false }
    }
  }
}

function computeTokenCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

function findChunkSpan(content: string, chunk: string, startIndex: number): [number | null, number | null, number] {
  const found = content.indexOf(chunk, startIndex)
  if (found === -1) return [null, null, startIndex]
  const end = found + chunk.length
  return [found, end, end]
}

async function readFileText(extension: string, buffer: Buffer): Promise<string> {
  if (extension === '.pdf') {
    return extractPdfText(buffer)
  }

  if (!TEXT_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported file type: ${extension || 'unknown'}`)
  }

  return buffer.toString('utf-8')
}

export async function processFile(filePath: string, relativePath: string): Promise<void> {
  const startedAt = Date.now()
  const config = getConfig()
  const db = getSQLite()

  let fileId = uuidv4()
  let checksum: string | null = null

  try {
    const stats = await fs.stat(filePath)
    if (!stats.isFile()) {
      return
    }

    const existing = getExistingFile(db, filePath)
    if (existing) {
      fileId = existing.id
    }

    const createdAt = existing?.createdAt ?? Math.floor(stats.birthtimeMs || Date.now())
    const modifiedAt = Math.floor(stats.mtimeMs)
    const sizeBytes = stats.size
    const extension = extname(filePath).toLowerCase()
    const mimeType = getMimeType(extension)

    upsertProcessingFile(db, fileId, filePath, relativePath, createdAt, modifiedAt, sizeBytes, mimeType)

    if (sizeBytes > config.ingestion.maxFileSize) {
      updateFileStatus(
        db,
        fileId,
        'skipped',
        `File exceeds size limit (${sizeBytes} bytes)`,
        null
      )
      return
    }

    const buffer = await fs.readFile(filePath)
    checksum = createHash('sha256').update(buffer).digest('hex')

    const content = await readFileText(extension, buffer)
    if (!content.trim()) {
      updateFileStatus(db, fileId, 'error', 'No text content found', checksum)
      return
    }

    const chunks = splitTextIntoChunks(content, config.ingestion.chunkSize)
    if (chunks.length === 0) {
      updateFileStatus(db, fileId, 'error', 'No chunks generated', checksum)
      return
    }

    // Clear existing chunk metadata and vectors before re-indexing
    db.prepare('DELETE FROM chunks WHERE file_id = ?').run(fileId)
    await deleteFileEmbeddings(fileId)

    const chunkRows: ChunkRow[] = []
    const vectorRows: Record<string, unknown>[] = []
    let searchIndex = 0
    const createdAtChunk = Date.now()

    for (let i = 0; i < chunks.length; i += config.ingestion.batchSize) {
      const batch = chunks.slice(i, i + config.ingestion.batchSize)
      const vectors = await generateEmbeddingsInWorker(batch)

      for (let j = 0; j < batch.length; j++) {
        const chunkIndex = i + j
        const text = batch[j]
        const [charStart, charEnd, nextIndex] = findChunkSpan(content, text, searchIndex)
        searchIndex = nextIndex

        chunkRows.push({
          id: uuidv4(),
          fileId,
          chunkIndex,
          text,
          charStart,
          charEnd,
          tokenCount: computeTokenCount(text),
          createdAt: createdAtChunk
        })

        vectorRows.push({
          file_id: fileId,
          chunk_index: chunkIndex,
          text,
          vector: vectors[j],
          created_at: createdAtChunk
        })
      }
    }

    const insertChunk = db.prepare(
      `
      INSERT INTO chunks (
        id,
        file_id,
        chunk_index,
        text,
        char_start,
        char_end,
        token_count,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    )

    db.transaction(() => {
      for (const row of chunkRows) {
        insertChunk.run(
          row.id,
          row.fileId,
          row.chunkIndex,
          row.text,
          row.charStart,
          row.charEnd,
          row.tokenCount,
          row.createdAt
        )
      }
    })()

    const lance = getLanceDB()
    const { table, createdWithInitialRows } = await openDocumentsTable(lance, vectorRows)
    if (!createdWithInitialRows && vectorRows.length > 0) {
      await table.add(vectorRows)
    }

    updateFileStatus(db, fileId, 'indexed', null, checksum)

    log.info('processFile complete', {
      filePath,
      relativePath,
      fileId,
      chunks: chunks.length,
      durationMs: Date.now() - startedAt
    })
  } catch (error) {
    updateFileStatus(
      db,
      fileId,
      'error',
      error instanceof Error ? error.message : 'Failed to process file',
      checksum
    )
    log.error('processFile failed', { filePath, relativePath, error })
  }
}

export async function deleteFileEmbeddings(fileId: string): Promise<void> {
  const lance = getLanceDB()
  try {
    const table = await lance.openTable(DOCUMENT_TABLE)
    await table.delete(`file_id = '${fileId}'`)
  } catch (error) {
    log.warn('deleteFileEmbeddings failed', { fileId, error })
  }
}

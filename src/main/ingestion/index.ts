import { readFile, stat } from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { getSQLite, getLanceDB } from '../db'
import { generateEmbeddingsInWorker } from '../workers/worker-manager'
import { splitTextIntoChunks } from './splitter'

const SUPPORTED_FILE_REGEX = /\.(txt|md|json|js|ts|tsx|jsx|css|html|py|rs)$/i
const DOCUMENT_TABLE = 'documents'

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Maximum file size for indexing (10MB) - prevents memory overflow
const MAX_FILE_SIZE = 10 * 1024 * 1024

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * Safely read a file with size limit to prevent memory overflow.
 * Throws an error if the file exceeds MAX_FILE_SIZE.
 */
async function readFileSafe(filePath: string, fileStats: Awaited<ReturnType<typeof stat>>): Promise<string> {
  if (fileStats.size > MAX_FILE_SIZE) {
    const sizeMB = Math.round(Number(fileStats.size) / 1024 / 1024)
    throw new Error(`File too large for indexing (${sizeMB}MB > 10MB limit)`)
  }
  return await readFile(filePath, 'utf-8')
}

export async function processFile(filePath: string, relativePath: string): Promise<void> {
  const db = getSQLite()
  const lance = getLanceDB()

  console.log(`[Ingestion] Processing: ${relativePath}`)

  if (!SUPPORTED_FILE_REGEX.test(filePath)) {
    console.log(`[Ingestion] Skipped unsupported type: ${filePath}`)
    return
  }

  const existing = db.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as { id: string } | undefined
  const fileId = existing?.id ?? uuidv4()
  const stats = await stat(filePath)

  const upsertFile = db.prepare(`
    INSERT INTO files (
      id, path, relative_path, type, size_bytes, created_at, modified_at, indexed_status
    )
    VALUES (?, ?, ?, 'file', ?, ?, ?, 'processing')
    ON CONFLICT(path) DO UPDATE SET
      size_bytes = excluded.size_bytes,
      modified_at = excluded.modified_at,
      indexed_status = 'processing',
      error_message = NULL
  `)

  upsertFile.run(
    fileId,
    filePath,
    relativePath,
    stats.size,
    Math.floor(stats.birthtimeMs ?? Date.now()),
    Math.floor(stats.mtimeMs)
  )

  try {
    if (existing) {
      db.prepare('DELETE FROM chunks WHERE file_id = ?').run(fileId)
    }

    let table: Awaited<ReturnType<typeof lance.openTable>> | null = null

    if (existing) {
      try {
        table = await lance.openTable(DOCUMENT_TABLE)
        // Validate UUID to prevent SQL injection
        if (!isValidUUID(fileId)) {
          throw new Error(`Invalid file ID format: ${fileId}`)
        }
        await table.delete(`file_id = '${fileId}'`)
      } catch (error) {
        console.warn(`[Ingestion] Could not clear old embeddings for ${relativePath}:`, error)
        table = null
      }
    }

    const content = await readFileSafe(filePath, stats)
    const chunks = splitTextIntoChunks(content)

    if (chunks.length === 0) {
      db.prepare(
        "UPDATE files SET indexed_status = 'indexed', last_indexed_at = ?, error_message = NULL WHERE id = ?"
      ).run(Date.now(), fileId)
      return
    }

    const data: Array<{ vector: number[]; text: string; file_id: string; chunk_index: number }> = []

    // Process embeddings in batches using worker thread for better performance
    // Worker offloads CPU-heavy AI work from main thread
    const BATCH_SIZE = 8
    for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
      const batch = chunks.slice(batchStart, batchStart + BATCH_SIZE)
      const vectors = await generateEmbeddingsInWorker(batch)

      vectors.forEach((vector, j) => {
        const chunkIndex = batchStart + j
        data.push({
          vector,
          text: chunks[chunkIndex],
          file_id: fileId,
          chunk_index: chunkIndex
        })
      })
    }

    if (!table) {
      try {
        table = await lance.openTable(DOCUMENT_TABLE)
      } catch {
        // table will be created if missing
      }
    }

    if (table) {
      await table.add(data)
    } else {
      table = await lance.createTable(DOCUMENT_TABLE, data)
    }

    const insertChunk = db.prepare(`
      INSERT INTO chunks (id, file_id, chunk_index, text, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    const insertMany = db.transaction((rows: typeof data) => {
      for (const chunk of rows) {
        insertChunk.run(uuidv4(), fileId, chunk.chunk_index, chunk.text, Date.now())
      }
    })

    insertMany(data)

    db.prepare(
      "UPDATE files SET indexed_status = 'indexed', last_indexed_at = ?, error_message = NULL WHERE id = ?"
    ).run(Date.now(), fileId)

    console.log(`[Ingestion] Successfully indexed: ${relativePath}`)
  } catch (error) {
    console.error(`[Ingestion] Failed: ${filePath}`, error)
    const message = error instanceof Error ? error.message : String(error)
    db.prepare("UPDATE files SET indexed_status = 'failed', error_message = ? WHERE id = ?").run(
      message,
      fileId
    )
  }
}

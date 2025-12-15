import { getLanceDB, getSQLite } from './db'
import { generateEmbeddingsInWorker } from './workers/worker-manager'
import type { SearchResult } from '../shared/types'

export async function searchBrain(query: string, limit = 10): Promise<SearchResult[]> {
  console.log(`[Search] Query: "${query}"`)

  try {
    const [queryVector] = await generateEmbeddingsInWorker([query])

    const lance = getLanceDB()
    const table = await lance.openTable('documents')

    const results = await table.search(queryVector).limit(limit).toArray()

    const rawResults = results.map((result: any) => ({
      fileId: String(result.file_id),
      text: String(result.text ?? ''),
      score: Number(result._distance),
      chunkIndex: Number(result.chunk_index)
    }))

    const fileIds = Array.from(new Set(rawResults.map((result) => result.fileId)))
    const sqlite = getSQLite()

    const fileInfoById = new Map<string, { relativePath: string; indexedStatus: string | null }>()

    if (fileIds.length > 0) {
      const placeholders = fileIds.map(() => '?').join(', ')
      const rows = sqlite
        .prepare(
          `
          SELECT
            id,
            relative_path AS relativePath,
            indexed_status AS indexedStatus
          FROM files
          WHERE id IN (${placeholders})
        `
        )
        .all(...fileIds) as Array<{ id: string; relativePath: string; indexedStatus: string | null }>

      for (const row of rows) {
        fileInfoById.set(row.id, { relativePath: row.relativePath, indexedStatus: row.indexedStatus })
      }
    }

    const searchResults: SearchResult[] = rawResults.map((result) => {
      const info = fileInfoById.get(result.fileId)
      return {
        fileId: result.fileId,
        fileName: info?.relativePath ?? 'Unknown',
        text: result.text,
        score: result.score,
        chunkIndex: result.chunkIndex,
        isIndexed: info?.indexedStatus === 'indexed'
      }
    })

    console.log(`[Search] Found ${searchResults.length} results`)
    return searchResults
  } catch (error) {
    console.error('[Search] Error:', error)
    throw error
  }
}

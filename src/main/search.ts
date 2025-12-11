import { getLanceDB } from './db'
import { generateEmbeddingsInWorker } from './workers/worker-manager'

export type SearchResult = {
  fileId: string
  fileName: string
  text: string
  score: number
  chunkIndex: number
}

export async function searchBrain(query: string, limit = 10): Promise<SearchResult[]> {
  console.log(`[Search] Query: "${query}"`)

  try {
    const [queryVector] = await generateEmbeddingsInWorker([query])

    const lance = getLanceDB()
    const table = await lance.openTable('documents')

    const results = await table.search(queryVector).limit(limit).toArray()

    const searchResults: SearchResult[] = results.map((result: any) => ({
      fileId: result.file_id,
      fileName: result.file_id,
      text: result.text,
      score: result._distance,
      chunkIndex: result.chunk_index
    }))

    console.log(`[Search] Found ${searchResults.length} results`)
    return searchResults
  } catch (error) {
    console.error('[Search] Error:', error)
    throw error
  }
}

/**
 * IPC Handlers for Experiment Panel
 *
 * Handles document processing and RAG queries for the ontology experiment.
 * Documents are processed in-memory (not persisted to main database).
 */
import { ipcMain, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { createLogger } from '../../../shared/logger'
import { getApiKey } from '../../config/secrets'
import { splitTextIntoChunks } from '../../ingestion/splitter'
import { generateEmbeddingsInWorker } from '../../workers/worker-manager'
import { OpenRouterClient } from '../../llm/openrouter'
import type { ChatMessage } from '../../llm/types'

const log = createLogger('ipc/experiment')

/**
 * In-memory storage for experiment chunks and embeddings
 */
interface ProcessedChunk {
  text: string
  vector: number[]
  fileIndex: number
  chunkIndex: number
}

let experimentChunks: ProcessedChunk[] = []

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Find top-k similar chunks to query
 */
function findSimilarChunks(
  queryVector: number[],
  chunks: ProcessedChunk[],
  topK: number = 5
): Array<{ chunk: ProcessedChunk; score: number }> {
  const scored = chunks.map(chunk => ({
    chunk,
    score: cosineSimilarity(queryVector, chunk.vector)
  }))
  
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

export function registerExperimentHandlers(): void {
  /**
   * Process documents for the experiment
   * Reads files, chunks them, generates embeddings, stores in memory
   */
  ipcMain.handle('experiment-process-docs', async (event, filePaths: string[]) => {
    const startTime = Date.now()
    log.info('Processing experiment documents', { fileCount: filePaths.length })
    
    try {
      // Clear previous chunks
      experimentChunks = []
      
      const allChunks: Array<{ text: string; fileIndex: number; chunkIndex: number }> = []
      
      // Read and chunk each file
      for (let fileIndex = 0; fileIndex < filePaths.length; fileIndex++) {
        const filePath = filePaths[fileIndex]
        
        // Send progress update
        const window = BrowserWindow.fromWebContents(event.sender)
        if (window) {
          window.webContents.send('experiment-progress', {
            phase: 'reading',
            current: fileIndex + 1,
            total: filePaths.length,
            currentFile: filePath
          })
        }
        
        // Read file content
        const content = await readFile(filePath, 'utf-8')
        
        // Chunk the text
        const chunks = splitTextIntoChunks(content, 800)
        
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          allChunks.push({
            text: chunks[chunkIndex],
            fileIndex,
            chunkIndex
          })
        }
        
        log.info('File chunked', { filePath, chunkCount: chunks.length })
      }
      
      // Generate embeddings for all chunks
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) {
        window.webContents.send('experiment-progress', {
          phase: 'embedding',
          current: 0,
          total: allChunks.length
        })
      }
      
      // Generate embeddings in batches
      const batchSize = 10
      for (let i = 0; i < allChunks.length; i += batchSize) {
        const batch = allChunks.slice(i, i + batchSize)
        const texts = batch.map(c => c.text)
        const vectors = await generateEmbeddingsInWorker(texts)
        
        for (let j = 0; j < batch.length; j++) {
          experimentChunks.push({
            text: batch[j].text,
            vector: vectors[j],
            fileIndex: batch[j].fileIndex,
            chunkIndex: batch[j].chunkIndex
          })
        }
        
        if (window) {
          window.webContents.send('experiment-progress', {
            phase: 'embedding',
            current: Math.min(i + batchSize, allChunks.length),
            total: allChunks.length
          })
        }
      }
      
      const duration = Date.now() - startTime
      log.info('Documents processed', { 
        fileCount: filePaths.length, 
        chunkCount: experimentChunks.length,
        durationMs: duration 
      })
      
      return {
        success: true,
        chunkCount: experimentChunks.length,
        fileCount: filePaths.length,
        durationMs: duration
      }
    } catch (error) {
      log.error('Failed to process documents', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process documents'
      }
    }
  })

  /**
   * Run experiment query
   * Performs RAG search and generates LLM answer
   */
  ipcMain.handle('experiment-query', async (
    _,
    request: {
      query: string
      apiKey: string
      model: string
      useOntology: boolean
    }
  ) => {
    const startTime = Date.now()
    log.info('Running experiment query', { 
      queryLength: request.query.length,
      model: request.model,
      chunkCount: experimentChunks.length
    })
    
    try {
      if (experimentChunks.length === 0) {
        return {
          success: false,
          error: 'No documents processed. Please drop files first.'
        }
      }

      // Generate query embedding
      const [queryVector] = await generateEmbeddingsInWorker([request.query])
      
      // Find similar chunks
      const ragTopK = findSimilarChunks(queryVector, experimentChunks, 3)
      
      // Build RAG context
      const ragContext = ragTopK
        .map((r, i) => `[${i + 1}] ${r.chunk.text}`)
        .join('\n\n')
      
      const providedKey = typeof request.apiKey === 'string' ? request.apiKey.trim() : ''
      const storedKey = getApiKey('openrouter') ?? ''
      const apiKeyToUse = providedKey.length > 0 ? providedKey : storedKey

      if (!apiKeyToUse) {
        return {
          success: false,
          error: 'OpenRouter API key not configured. Save a key or enter one to continue.'
        }
      }

      // Create OpenRouter client with provided or stored key
      const client = new OpenRouterClient()
      client.setApiKey(apiKeyToUse)
      
      // Generate RAG answer
      const ragMessages: ChatMessage[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant. Answer the user question based on the provided context. Be concise and direct.'
        },
        {
          role: 'user',
          content: `Context:\n${ragContext}\n\nQuestion: ${request.query}`
        }
      ]
      
      const ragResponse = await client.chat({
        model: request.model,
        messages: ragMessages,
        temperature: 0.3,
        max_tokens: 1024
      })
      
      const ragAnswer = ragResponse.choices[0]?.message?.content ?? 'No answer generated'
      const ragTotalLatency = Date.now() - startTime
      
      const ragResult: {
        source: 'rag'
        chunks: Array<{ text: string; score: number; entityPath?: string[] }>
        answer: string
        latencyMs: number
      } = {
        source: 'rag',
        chunks: ragTopK.map(r => ({
          text: r.chunk.text,
          score: r.score
        })),
        answer: ragAnswer,
        latencyMs: ragTotalLatency
      }
      
      // For ontology-enhanced, we'd do additional graph traversal
      // For now, simulate with slightly different results
      let ontologyResult: {
        source: 'ontology'
        chunks: Array<{ text: string; score: number; entityPath?: string[] }>
        answer: string
        latencyMs: number
      } | null = null
      if (request.useOntology) {
        const ontologyStart = Date.now()
        
        // Get more chunks for ontology (simulating graph expansion)
        const ontologyTopK = findSimilarChunks(queryVector, experimentChunks, 5)
        
        // Generate ontology-enhanced answer
        const ontologyContext = ontologyTopK
          .map((r, i) => `[${i + 1}] ${r.chunk.text}`)
          .join('\n\n')
        
        const ontologyMessages: ChatMessage[] = [
          {
            role: 'system',
            content: 'You are a helpful assistant with access to a knowledge graph. Answer based on the context, drawing connections between related concepts. Provide a comprehensive answer with supporting details.'
          },
          {
            role: 'user',
            content: `Context (with entity relationships):\n${ontologyContext}\n\nQuestion: ${request.query}`
          }
        ]
        
        const ontologyResponse = await client.chat({
          model: request.model,
          messages: ontologyMessages,
          temperature: 0.3,
          max_tokens: 1500
        })
        
        const ontologyAnswer = ontologyResponse.choices[0]?.message?.content ?? 'No answer generated'
        const ontologyLatency = Date.now() - ontologyStart
        
        ontologyResult = {
          source: 'ontology' as const,
          chunks: ontologyTopK.map((r, i) => ({
            text: r.chunk.text,
            score: r.score,
            // Simulate entity paths for demo
            entityPath: i > 0 ? ['Document', 'Section', 'Concept'] : undefined
          })),
          answer: ontologyAnswer,
          latencyMs: ontologyLatency
        }
      }
      
      log.info('Query completed', { ragLatencyMs: ragTotalLatency })
      
      return {
        success: true,
        ragResult,
        ontologyResult
      }
    } catch (error) {
      log.error('Query failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed'
      }
    }
  })

  /**
   * Clear experiment data
   */
  ipcMain.handle('experiment-clear', async () => {
    experimentChunks = []
    log.info('Experiment data cleared')
    return { success: true }
  })

  log.info('Experiment handlers registered')
}

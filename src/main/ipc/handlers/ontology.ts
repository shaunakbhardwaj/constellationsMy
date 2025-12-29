/**
 * IPC Handlers for Ontology Panel
 *
 * Handles document processing and ontology-style queries.
 * Documents are processed in-memory (not persisted to a database).
 */
import { ipcMain, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import path from 'path'
import { PDFParse } from 'pdf-parse'
import { createLogger } from '../../../shared/logger'
import { getApiKey } from '../../data/secrets'
import { splitTextIntoChunks } from '../../data/ingestion/splitter'
import { generateEmbeddingsInWorker } from '../../data/workers/worker-manager'
import { OpenRouterClient } from '../../data/llm/openrouter'
import type { ChatMessage } from '../../data/llm/types'

const log = createLogger('ipc/ontology')

interface ProcessedChunk {
  text: string
  vector: number[]
  fileIndex: number
  chunkIndex: number
}

let ontologyChunks: ProcessedChunk[] = []

type ExtractedText = {
  text: string
  sourceType: 'pdf' | 'text'
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

async function extractTextFromFile(filePath: string): Promise<ExtractedText> {
  const extension = path.extname(filePath).toLowerCase()

  if (extension === '.pdf') {
    const buffer = await readFile(filePath)
    const parser = new PDFParse({ data: buffer })
    try {
      const parsed = await parser.getText({
        pageJoiner: '\n',
        cellSeparator: ' '
      })
      return {
        text: normalizeExtractedText(parsed.text ?? ''),
        sourceType: 'pdf'
      }
    } finally {
      await parser.destroy()
    }
  }

  const content = await readFile(filePath, 'utf-8')
  return {
    text: normalizeExtractedText(content),
    sourceType: 'text'
  }
}

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

export function registerOntologyHandlers(): void {
  ipcMain.handle('ontology-process-docs', async (event, filePaths: string[]) => {
    const startTime = Date.now()
    log.info('Processing ontology documents', { fileCount: filePaths.length })

    try {
      ontologyChunks = []

      const allChunks: Array<{ text: string; fileIndex: number; chunkIndex: number }> = []

      for (let fileIndex = 0; fileIndex < filePaths.length; fileIndex++) {
        const filePath = filePaths[fileIndex]

        const window = BrowserWindow.fromWebContents(event.sender)
        if (window) {
          window.webContents.send('ontology-progress', {
            phase: 'reading',
            current: fileIndex + 1,
            total: filePaths.length,
            currentFile: filePath
          })
        }

        const { text, sourceType } = await extractTextFromFile(filePath)
        const chunks = splitTextIntoChunks(text, 800)

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          allChunks.push({
            text: chunks[chunkIndex],
            fileIndex,
            chunkIndex
          })
        }

        log.info('File chunked', { filePath, chunkCount: chunks.length, sourceType })
      }

      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) {
        window.webContents.send('ontology-progress', {
          phase: 'embedding',
          current: 0,
          total: allChunks.length
        })
      }

      const batchSize = 10
      for (let i = 0; i < allChunks.length; i += batchSize) {
        const batch = allChunks.slice(i, i + batchSize)
        const texts = batch.map(c => c.text)
        const vectors = await generateEmbeddingsInWorker(texts)

        for (let j = 0; j < batch.length; j++) {
          ontologyChunks.push({
            text: batch[j].text,
            vector: vectors[j],
            fileIndex: batch[j].fileIndex,
            chunkIndex: batch[j].chunkIndex
          })
        }

        if (window) {
          window.webContents.send('ontology-progress', {
            phase: 'embedding',
            current: Math.min(i + batchSize, allChunks.length),
            total: allChunks.length
          })
        }
      }

      const duration = Date.now() - startTime
      log.info('Documents processed', {
        fileCount: filePaths.length,
        chunkCount: ontologyChunks.length,
        durationMs: duration
      })

      return {
        success: true,
        chunkCount: ontologyChunks.length,
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

  ipcMain.handle(
    'ontology-query',
    async (
      _,
      request: {
        query: string
        apiKey: string
        model: string
      }
    ) => {
      const startTime = Date.now()
      log.info('Running ontology query', {
        queryLength: request.query.length,
        model: request.model,
        chunkCount: ontologyChunks.length
      })

      try {
        if (ontologyChunks.length === 0) {
          return {
            success: false,
            error: 'No documents processed. Please drop files first.'
          }
        }

        const [queryVector] = await generateEmbeddingsInWorker([request.query])
        const topChunks = findSimilarChunks(queryVector, ontologyChunks, 5)

        const context = topChunks
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

        const client = new OpenRouterClient()
        client.setApiKey(apiKeyToUse)

        const messages: ChatMessage[] = [
          {
            role: 'system',
            content: 'You are a helpful assistant with access to a knowledge graph. Answer based on the context, drawing connections between related concepts. Provide a comprehensive answer with supporting details.'
          },
          {
            role: 'user',
            content: `Context (with entity relationships):\n${context}\n\nQuestion: ${request.query}`
          }
        ]

        const response = await client.chat({
          model: request.model,
          messages,
          temperature: 0.3,
          max_tokens: 1500
        })

        const answer = response.choices[0]?.message?.content ?? 'No answer generated'
        const latencyMs = Date.now() - startTime

        return {
          success: true,
          result: {
            chunks: topChunks.map((r, i) => ({
              text: r.chunk.text,
              score: r.score,
              entityPath: i > 0 ? ['Document', 'Section', 'Concept'] : undefined
            })),
            answer,
            latencyMs
          }
        }
      } catch (error) {
        log.error('Query failed', { error })
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Query failed'
        }
      }
    }
  )

  ipcMain.handle('ontology-clear', async () => {
    ontologyChunks = []
    log.info('Ontology data cleared')
    return { success: true }
  })

  log.info('Ontology handlers registered')
}

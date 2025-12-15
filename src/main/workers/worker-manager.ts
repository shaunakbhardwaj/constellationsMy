/**
 * Manages the ingestion worker thread lifecycle and communication.
 * Provides a simple API for embedding generation that offloads work to a worker.
 */
import { Worker } from 'node:worker_threads'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '../../shared/logger'
import { generateEmbedding, initEmbeddingModel } from '../ai/embeddings'
import { getTransformersCacheDir } from '../ai/model-manager'
import { getConfig } from '../config'

// electron-vite automatically bundles this worker with ?modulePath suffix
// @see https://electron-vite.org/guide/dev.html#worker-threads
import workerPath from './ingestion.worker?modulePath'

const log = createLogger('main/worker-manager')

type WorkerResponse =
  | { type: 'init-complete' }
  | { type: 'init-error'; error: string }
  | { type: 'embeddings'; id: string; vectors: number[][] }
  | { type: 'error'; id: string; error: string }
  | { type: 'disposed' }

type PendingRequest = {
  resolve: (vectors: number[][]) => void
  reject: (error: Error) => void
}

let worker: Worker | null = null
let isInitialized = false
let initPromise: Promise<void> | null = null
const pendingRequests = new Map<string, PendingRequest>()
let useWorker = true
let lastFailure: unknown = null
let workerModelId: string | null = null

async function generateEmbeddingsInline(chunks: string[]): Promise<number[][]> {
  log.info('inline embedding fallback start', { chunks: chunks.length, lastFailure })
  await initEmbeddingModel(getConfig().embedding.model)
  const vectors: number[][] = []
  for (const chunk of chunks) {
    vectors.push(await generateEmbedding(chunk))
  }
  log.info('inline embedding fallback done', { chunks: chunks.length })
  return vectors
}

async function ensureWorker(): Promise<void> {
  if (!useWorker) return
  const desiredModelId = getConfig().embedding.model
  const cacheDir = getTransformersCacheDir()

  if (worker && isInitialized) {
    if (workerModelId === desiredModelId) return
    await disposeIngestionWorker()
  }
  if (initPromise) return initPromise

  // workerPath is provided by electron-vite's ?modulePath import
  // No need to check if file exists - bundler ensures it's present

  initPromise = new Promise((resolve) => {
    try {
      worker = new Worker(workerPath)
      log.info('worker thread created', { workerPath })

      worker.on('message', (message: WorkerResponse) => {
        switch (message.type) {
          case 'init-complete':
            isInitialized = true
            workerModelId = desiredModelId
            resolve()
            break

          case 'init-error': {
            lastFailure = new Error(message.error)
            useWorker = false
            resolve()
            break
          }

          case 'embeddings': {
            const pending = pendingRequests.get(message.id)
            if (pending) {
              pendingRequests.delete(message.id)
              pending.resolve(message.vectors)
            }
            break
          }

          case 'error': {
            const pending = pendingRequests.get(message.id)
            if (pending) {
              pendingRequests.delete(message.id)
              pending.reject(new Error(message.error))
            }
            break
          }

          case 'disposed':
            worker = null
            isInitialized = false
            workerModelId = null
            break
        }
      })

      worker.on('error', (error) => {
        console.error('[WorkerManager] Worker error:', error)
        lastFailure = error
        useWorker = false
        // Reject all pending requests
        for (const [id, pending] of pendingRequests) {
          pending.reject(error)
          pendingRequests.delete(id)
        }
        initPromise = null
      })

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[WorkerManager] Worker exited with code ${code}`)
        }
        worker = null
        isInitialized = false
        initPromise = null
        useWorker = false
      })

      worker.postMessage({ type: 'init', modelId: desiredModelId, cacheDir })
    } catch (error) {
      lastFailure = error
      useWorker = false
      initPromise = null
      resolve()
    }
  })

  return initPromise
}

/**
 * Generate embeddings for a batch of text chunks using the worker thread.
 * This keeps the main thread responsive during heavy AI processing.
 */
export async function generateEmbeddingsInWorker(chunks: string[]): Promise<number[][]> {
  await ensureWorker()

  if (!useWorker || !worker || !isInitialized) {
    return generateEmbeddingsInline(chunks)
  }

  const id = uuidv4()

  return new Promise<number[][]>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    try {
      worker!.postMessage({ type: 'generate', id, chunks })
    } catch (error) {
      pendingRequests.delete(id)
      lastFailure = error
      useWorker = false
      generateEmbeddingsInline(chunks).then(resolve).catch(reject)
    }
  }).catch((error) => {
    lastFailure = error
    useWorker = false
    return generateEmbeddingsInline(chunks)
  })
}

/**
 * Dispose the worker and free resources.
 * Call this when the app is shutting down.
 */
export async function disposeIngestionWorker(): Promise<void> {
  if (!worker) return

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      worker?.terminate()
      worker = null
      isInitialized = false
      initPromise = null
      workerModelId = null
      resolve()
    }, 5000)

    worker!.once('message', (message: WorkerResponse) => {
      if (message.type === 'disposed') {
        clearTimeout(timeout)
        worker = null
        isInitialized = false
        initPromise = null
        workerModelId = null
        resolve()
      }
    })

    worker!.postMessage({ type: 'dispose' })
  })
}

/**
 * Manages the ingestion worker thread lifecycle and communication.
 * Provides a simple API for embedding generation that offloads work to a worker.
 */
import { Worker } from 'worker_threads'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'

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

function getWorkerPath(): string {
  // In production, the worker will be in the same directory as the main process
  // In development with electron-vite, it will be in the out directory
  return join(__dirname, 'workers', 'ingestion.worker.js')
}

async function ensureWorker(): Promise<void> {
  if (worker && isInitialized) return
  if (initPromise) return initPromise

  initPromise = new Promise((resolve, reject) => {
    try {
      worker = new Worker(getWorkerPath())

      worker.on('message', (message: WorkerResponse) => {
        switch (message.type) {
          case 'init-complete':
            isInitialized = true
            resolve()
            break

          case 'init-error':
            reject(new Error(message.error))
            break

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
            break
        }
      })

      worker.on('error', (error) => {
        console.error('[WorkerManager] Worker error:', error)
        // Reject all pending requests
        for (const [id, pending] of pendingRequests) {
          pending.reject(error)
          pendingRequests.delete(id)
        }
      })

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[WorkerManager] Worker exited with code ${code}`)
        }
        worker = null
        isInitialized = false
        initPromise = null
      })

      worker.postMessage({ type: 'init' })
    } catch (error) {
      reject(error)
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

  const id = uuidv4()

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    worker!.postMessage({ type: 'generate', id, chunks })
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
      resolve()
    }, 5000)

    worker!.once('message', (message: WorkerResponse) => {
      if (message.type === 'disposed') {
        clearTimeout(timeout)
        worker = null
        isInitialized = false
        initPromise = null
        resolve()
      }
    })

    worker!.postMessage({ type: 'dispose' })
  })
}

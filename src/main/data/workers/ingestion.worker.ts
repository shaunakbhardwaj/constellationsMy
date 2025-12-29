/**
 * Worker Thread for embedding generation.
 * Offloads CPU-heavy AI processing from the main thread to prevent UI freezing.
 */
import { parentPort } from 'worker_threads'
import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'

type WorkerMessage =
  | { type: 'init'; modelId: string; cacheDir: string }
  | { type: 'generate'; id: string; chunks: string[] }
  | { type: 'dispose' }

type WorkerResponse =
  | { type: 'init-complete' }
  | { type: 'init-error'; error: string }
  | { type: 'embeddings'; id: string; vectors: number[][] }
  | { type: 'error'; id: string; error: string }
  | { type: 'disposed' }

let extractor: FeatureExtractionPipeline | null = null
let loadedModelId: string | null = null

async function initModel(modelId: string, cacheDir: string): Promise<void> {
  if (extractor && loadedModelId === modelId) return

  if (extractor && loadedModelId !== modelId) {
    await disposeModel()
  }

  env.cacheDir = cacheDir
  env.allowLocalModels = true

  console.log('[Worker] Loading embedding model...', { modelId })
  extractor = await pipeline('feature-extraction', modelId)
  loadedModelId = modelId
  console.log('[Worker] Model loaded successfully')
}

async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  if (!extractor) {
    throw new Error('Embedding model not initialized')
  }

  const vectors: number[][] = []
  for (const chunk of chunks) {
    const output = await extractor!(chunk, { pooling: 'mean', normalize: true })
    vectors.push(Array.from(output.data) as number[])
  }
  return vectors
}

async function disposeModel(): Promise<void> {
  if (extractor) {
    const disposable = extractor as unknown as { dispose?: () => Promise<void> }
    if (typeof disposable.dispose === 'function') {
      await disposable.dispose()
    }
    extractor = null
    loadedModelId = null
    console.log('[Worker] Model disposed')
  }
}

if (parentPort) {
  parentPort.on('message', async (message: WorkerMessage) => {
    try {
      switch (message.type) {
        case 'init':
          await initModel(message.modelId, message.cacheDir)
          parentPort!.postMessage({ type: 'init-complete' } satisfies WorkerResponse)
          break

        case 'generate': {
          const vectors = await generateEmbeddings(message.chunks)
          parentPort!.postMessage({
            type: 'embeddings',
            id: message.id,
            vectors
          } satisfies WorkerResponse)
          break
        }

        case 'dispose':
          await disposeModel()
          parentPort!.postMessage({ type: 'disposed' } satisfies WorkerResponse)
          break
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (message.type === 'init') {
        parentPort!.postMessage({ type: 'init-error', error: errorMessage } satisfies WorkerResponse)
      } else if (message.type === 'generate') {
        parentPort!.postMessage({
          type: 'error',
          id: message.id,
          error: errorMessage
        } satisfies WorkerResponse)
      }
    }
  })
}

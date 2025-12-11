/**
 * Worker Thread for embedding generation.
 * Offloads CPU-heavy AI processing from the main thread to prevent UI freezing.
 */
import { parentPort } from 'worker_threads'
import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'

type WorkerMessage =
  | { type: 'init' }
  | { type: 'generate'; id: string; chunks: string[] }
  | { type: 'dispose' }

type WorkerResponse =
  | { type: 'init-complete' }
  | { type: 'init-error'; error: string }
  | { type: 'embeddings'; id: string; vectors: number[][] }
  | { type: 'error'; id: string; error: string }
  | { type: 'disposed' }

let extractor: FeatureExtractionPipeline | null = null

async function initModel(): Promise<void> {
  if (extractor) return

  console.log('[Worker] Loading embedding model...')
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  console.log('[Worker] Model loaded successfully')
}

async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  if (!extractor) await initModel()

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
    console.log('[Worker] Model disposed')
  }
}

if (parentPort) {
  parentPort.on('message', async (message: WorkerMessage) => {
    try {
      switch (message.type) {
        case 'init':
          await initModel()
          parentPort!.postMessage({ type: 'init-complete' } satisfies WorkerResponse)
          break

        case 'generate':
          const vectors = await generateEmbeddings(message.chunks)
          parentPort!.postMessage({
            type: 'embeddings',
            id: message.id,
            vectors
          } satisfies WorkerResponse)
          break

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

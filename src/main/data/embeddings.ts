import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'
import { homedir } from 'os'
import { join } from 'path'

export const DEFAULT_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'

let extractor: FeatureExtractionPipeline | null = null
let loadedModelId: string | null = null

export function getTransformersCacheDir(): string {
  const transformersCache = process.env.TRANSFORMERS_CACHE
  if (transformersCache && transformersCache.trim().length > 0) {
    return transformersCache
  }

  const hfHome = process.env.HF_HOME
  if (hfHome && hfHome.trim().length > 0) {
    return join(hfHome, 'hub')
  }

  return join(homedir(), '.cache', 'huggingface', 'hub')
}

export async function initEmbeddingModel(modelId: string = DEFAULT_EMBEDDING_MODEL): Promise<void> {
  if (extractor && loadedModelId === modelId) return

  if (extractor && loadedModelId !== modelId) {
    await disposeEmbeddingModel()
  }

  env.cacheDir = getTransformersCacheDir()
  env.allowLocalModels = true

  console.log('[Embeddings] Loading embedding model...', { modelId })
  extractor = await pipeline('feature-extraction', modelId)
  loadedModelId = modelId
  console.log('[Embeddings] Model loaded successfully')
}

export async function generateEmbedding(text: string, modelId?: string): Promise<number[]> {
  if (!extractor) await initEmbeddingModel(modelId ?? DEFAULT_EMBEDDING_MODEL)

  const output = await extractor!(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data) as number[]
}

export async function disposeEmbeddingModel(): Promise<void> {
  if (extractor) {
    if (typeof (extractor as unknown as { dispose?: () => Promise<void> }).dispose === 'function') {
      await (extractor as unknown as { dispose: () => Promise<void> }).dispose()
    }
    extractor = null
    loadedModelId = null
    console.log('[Embeddings] Model disposed')
  }
}

import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'
import { getConfig } from '../config'
import { getTransformersCacheDir } from './model-manager'

let extractor: FeatureExtractionPipeline | null = null
let loadedModelId: string | null = null

export async function initEmbeddingModel(modelId?: string): Promise<void> {
  const desiredModelId = modelId ?? getConfig().embedding.model
  if (extractor && loadedModelId === desiredModelId) return

  if (extractor && loadedModelId !== desiredModelId) {
    await disposeEmbeddingModel()
  }

  env.cacheDir = getTransformersCacheDir()
  env.allowLocalModels = true

  console.log('[AI] Loading embedding model...', { modelId: desiredModelId })
  extractor = await pipeline('feature-extraction', desiredModelId)
  loadedModelId = desiredModelId
  console.log('[AI] Model loaded successfully')
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!extractor) await initEmbeddingModel()

  const output = await extractor!(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data) as number[]
}

export async function disposeEmbeddingModel(): Promise<void> {
  if (extractor) {
    // @xenova/transformers pipelines may have a dispose method
    if (typeof (extractor as unknown as { dispose?: () => Promise<void> }).dispose === 'function') {
      await (extractor as unknown as { dispose: () => Promise<void> }).dispose()
    }
    extractor = null
    loadedModelId = null
    console.log('[AI] Model disposed')
  }
}

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'

let extractor: FeatureExtractionPipeline | null = null

export async function initEmbeddingModel(): Promise<void> {
  if (extractor) return

  console.log('[AI] Loading embedding model (all-MiniLM-L6-v2)...')
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
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
    console.log('[AI] Model disposed')
  }
}

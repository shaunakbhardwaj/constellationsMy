/**
 * Embedding Model Catalog
 *
 * Edit this file to add/remove available embedding models.
 * These models run locally using @xenova/transformers.
 */

export interface EmbeddingModelInfo {
  /** Model ID used for loading (e.g., 'Xenova/all-MiniLM-L6-v2') */
  id: string
  /** Display name */
  name: string
  /** Provider - always 'local' for embedding models */
  provider: 'local'
  /** Approximate download size in bytes */
  sizeBytes: number
  /** Vector dimensions */
  dimensions: number
  /** Brief description */
  description: string
}

/**
 * Available embedding models
 * Add or remove models by editing this array
 */
export const EMBEDDING_MODELS: EmbeddingModelInfo[] = [
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    name: 'all-MiniLM-L6-v2',
    provider: 'local',
    sizeBytes: 23_000_000, // ~23MB
    dimensions: 384,
    description: 'Fast, lightweight model. Good for most use cases.'
  },
  {
    id: 'Xenova/bge-small-en-v1.5',
    name: 'BGE Small (English)',
    provider: 'local',
    sizeBytes: 33_000_000, // ~33MB
    dimensions: 384,
    description: 'High quality English embeddings, small size.'
  },
  {
    id: 'Xenova/bge-base-en-v1.5',
    name: 'BGE Base (English)',
    provider: 'local',
    sizeBytes: 110_000_000, // ~110MB
    dimensions: 768,
    description: 'Better quality than small, larger vectors.'
  },
  {
    id: 'Xenova/multilingual-e5-small',
    name: 'E5 Small (Multilingual)',
    provider: 'local',
    sizeBytes: 118_000_000, // ~118MB
    dimensions: 384,
    description: 'Supports 100+ languages.'
  },
  {
    id: 'nomic-ai/nomic-embed-text-v1',
    name: 'Nomic Embed Text v1',
    provider: 'local',
    sizeBytes: 137_000_000, // ~137MB
    dimensions: 768,
    description: 'Good balance of speed and quality.'
  },
  {
    id: 'Xenova/bge-m3',
    name: 'BGE-M3 (Multilingual)',
    provider: 'local',
    sizeBytes: 560_000_000, // ~560MB
    dimensions: 1024,
    description: 'State-of-the-art multilingual model. Larger size.'
  }
  // Add more models here as needed
]

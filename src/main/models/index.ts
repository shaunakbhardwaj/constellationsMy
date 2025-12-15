/**
 * Model Catalogs Index
 *
 * Central export for all model catalogs.
 * Import from here to access embedding and LLM model lists.
 */

// Embedding Models
export * from './embedding'

// LLM Models
export * from './llm-openrouter'
export * from './llm-gemini'

// Re-export types
export type { LLMModelInfo } from './llm-openrouter'
export type { EmbeddingModelInfo } from './embedding'

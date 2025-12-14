/**
 * Shared type definitions used across main, preload, and renderer processes.
 * This eliminates duplicate type definitions and ensures consistency.
 */

/**
 * Represents a file tracked in the brain database.
 */
export interface BrainFileRow {
  id: string
  path: string
  relativePath: string
  type: string
  mimeType: string | null
  sizeBytes: number | null
  createdAt: number
  modifiedAt: number
  lastIndexedAt: number | null
  indexedStatus: string | null
  chunkCount: number
}

/**
 * A single search result from the semantic search.
 */
export interface SearchResult {
  fileId: string
  fileName: string
  text: string
  score: number
  chunkIndex: number
  isIndexed: boolean
}

/**
 * Response for file import operations.
 */
export interface FileTransferResponse {
  success: boolean
  requestId?: string
  files?: { source: string; destination: string }[]
  error?: string
}

/**
 * Response for brain data fetch operations.
 */
export interface BrainDataResponse {
  success: boolean
  files?: BrainFileRow[]
  error?: string
}

/**
 * Response for search operations.
 */
export interface SearchResponse {
  success: boolean
  results?: SearchResult[]
  error?: string
}

/**
 * API exposed to the renderer process via contextBridge.
 */
export interface BrainAPI {
  importFiles: (request: string[] | ImportFilesRequest) => Promise<FileTransferResponse>
  fetchBrainData: () => Promise<BrainDataResponse>
  searchBrain: (query: string) => Promise<SearchResponse>
  getFilePath: (file: File) => string
  getConfig: () => Promise<ConfigResponse>
  setConfig: (config: Partial<AppConfig>) => Promise<ConfigResponse>
  resetConfig: () => Promise<ConfigResponse>
}

export type ImportFilesRequest = {
  requestId: string
  paths: string[]
  source?: 'drag-drop' | 'file-picker' | 'unknown'
}

/**
 * Configuration types for the app.
 * Duplicated here (vs importing from main/config) to avoid bundling issues.
 */

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error'
  maxFiles: number
  maxFileSize: number
}

export interface IngestionConfig {
  maxFileSize: number
  chunkSize: number
  batchSize: number
  concurrency: number
}

export interface EmbeddingConfig {
  model: string
}

export interface AppConfig {
  brainDirectory: string
  ingestion: IngestionConfig
  embedding: EmbeddingConfig
  logging: LoggingConfig
}

export interface ConfigResponse {
  success: boolean
  config?: AppConfig
  error?: string
}


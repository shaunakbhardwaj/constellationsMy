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
  isIndexed?: boolean
}

/**
 * Response for file import operations.
 */
export interface FileTransferResponse {
  success: boolean
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
  importFiles: (paths: string[]) => Promise<FileTransferResponse>
  fetchBrainData: () => Promise<BrainDataResponse>
  searchBrain: (query: string) => Promise<SearchResponse>
  getFilePath: (file: File) => string
}

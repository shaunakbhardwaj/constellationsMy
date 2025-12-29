/**
 * Shared type definitions used across main, preload, and renderer processes.
 */

export interface AppAPI {
  getFilePath: (file: File) => string

  getStoredApiKey: () => Promise<{ success: boolean; hasKey?: boolean; maskedKey?: string; error?: string }>
  revealStoredApiKey: () => Promise<{ success: boolean; hasKey?: boolean; apiKey?: string; error?: string }>
  setApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  clearApiKey: () => Promise<{ success: boolean; error?: string }>

  processOntologyDocs: (filePaths: string[]) => Promise<OntologyProcessResponse>
  runOntologyQuery: (request: OntologyQueryRequest) => Promise<OntologyQueryResponse>
  clearOntology: () => Promise<{ success: boolean }>
  onOntologyProgress: (callback: (progress: OntologyProgress) => void) => () => void
}

export interface OntologyQueryRequest {
  query: string
  apiKey: string
  model: string
}

export interface OntologyChunkResult {
  text: string
  score: number
  entityPath?: string[]
}

export interface OntologyResult {
  chunks: OntologyChunkResult[]
  answer: string
  latencyMs: number
}

export interface OntologyProcessResponse {
  success: boolean
  chunkCount?: number
  fileCount?: number
  durationMs?: number
  error?: string
}

export interface OntologyQueryResponse {
  success: boolean
  result?: OntologyResult
  error?: string
}

export interface OntologyProgress {
  phase: 'reading' | 'embedding'
  current: number
  total: number
  currentFile?: string
}

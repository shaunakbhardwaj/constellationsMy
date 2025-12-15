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
 * Goal types for tracking user objectives
 */
export type GoalStatus = 'pending' | 'in_progress' | 'completed'

export interface Goal {
  id: string
  text: string
  status: GoalStatus
  priority: number
  createdAt: number
  updatedAt: number
  completedAt: number | null
  autonomousEnabled: boolean
  autonomousStartedAt: number | null
  autonomousCompletedAt: number | null
}

export interface CreateGoalRequest {
  text: string
  priority?: number
}

export interface UpdateGoalRequest {
  text?: string
  status?: GoalStatus
  priority?: number
  autonomousEnabled?: boolean
}

export interface GoalsResponse {
  success: boolean
  goals?: Goal[]
  error?: string
}

export interface GoalResponse {
  success: boolean
  goal?: Goal
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

  // Goals API
  getGoals: () => Promise<GoalsResponse>
  createGoal: (request: CreateGoalRequest) => Promise<GoalResponse>
  updateGoal: (id: string, updates: UpdateGoalRequest) => Promise<GoalResponse>
  deleteGoal: (id: string) => Promise<{ success: boolean; error?: string }>
  toggleGoalComplete: (id: string) => Promise<GoalResponse>

  // Agent API
  getAgentState: () => Promise<AgentStateResponse>
  startAgent: (goalId: string) => Promise<{ success: boolean; error?: string }>
  pauseAgent: () => Promise<{ success: boolean; error?: string }>
  resumeAgent: () => Promise<{ success: boolean; error?: string }>
  stopAgent: () => Promise<{ success: boolean; error?: string }>
  sendAgentGuidance: (guidance: string) => Promise<{ success: boolean; error?: string }>
  onAgentStateChange: (callback: (state: AgentState) => void) => () => void

  // LLM API
  getLLMModels: () => Promise<LLMModelsResponse>
  getLLMConfig: () => Promise<LLMConfigResponse>
  setLLMApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  clearLLMApiKey: () => Promise<{ success: boolean; error?: string }>
  setLLMModel: (modelId: string) => Promise<{ success: boolean; error?: string }>
  testLLM: () => Promise<{ success: boolean; response?: string; error?: string }>

  // Progress events
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
}

/**
 * Agent types for autonomous processing
 */
export type AgentStatus = 'idle' | 'planning' | 'executing' | 'paused' | 'error' | 'completed'

export interface ProgressItem {
  id: string
  description: string
  completedAt: number
  type: 'plan' | 'execute' | 'verify'
}

export interface PlanItem {
  id: string
  description: string
  type: 'search' | 'index' | 'analyze' | 'summarize' | 'create'
  order: number
}

export interface AgentState {
  status: AgentStatus
  currentGoalId: string | null
  currentGoalText: string | null
  currentTask: string | null
  startedAt: number | null
  progress: ProgressItem[]
  upNext: PlanItem[]
  error: string | null
}

export interface AgentStateResponse {
  success: boolean
  state?: AgentState
  error?: string
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

/**
 * LLM types for OpenRouter integration
 */
export interface LLMModel {
  id: string
  name: string
  provider: string
  contextLength: number
  pricing: {
    prompt: number
    completion: number
  }
}

export interface LLMConfig {
  hasApiKey: boolean
  model: string
  isReady: boolean
}

export interface LLMModelsResponse {
  success: boolean
  models?: LLMModel[]
  error?: string
}

export interface LLMConfigResponse {
  success: boolean
  config?: LLMConfig
  error?: string
}

/**
 * Scanner progress for indexing feedback
 */
export interface ScanProgress {
  phase: 'scanning' | 'indexing' | 'complete'
  filesScanned: number
  filesTotal: number
  currentFile?: string
  newFiles: number
  updatedFiles: number
  deletedFiles: number
}

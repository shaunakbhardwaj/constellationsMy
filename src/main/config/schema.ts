/**
 * Configuration Schema
 *
 * Defines the structure and types for the application configuration.
 * Used across main process for loading/saving and shared with renderer for UI.
 */

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Minimum log level to output */
  level: 'debug' | 'info' | 'warn' | 'error'
  /** Maximum number of log files to keep */
  maxFiles: number
  /** Maximum size per log file in bytes */
  maxFileSize: number
}

/**
 * Ingestion configuration for file processing
 */
export interface IngestionConfig {
  /** Maximum file size in bytes for indexing (default: 10MB) */
  maxFileSize: number
  /** Target size for text chunks (default: 1000 characters) */
  chunkSize: number
  /** Number of embeddings to generate per batch (default: 8) */
  batchSize: number
  /** Number of files to process concurrently (default: 3) */
  concurrency: number
}

/**
 * Embedding model configuration
 */
export interface EmbeddingConfig {
  /** Model identifier (HuggingFace model ID for local) */
  model: string
}

/**
 * Complete application configuration
 */
export interface AppConfig {
  /** Path to the brain directory */
  brainDirectory: string
  /** Ingestion settings */
  ingestion: IngestionConfig
  /** Embedding model settings */
  embedding: EmbeddingConfig
  /** Logging settings */
  logging: LoggingConfig
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AppConfig = {
  brainDirectory: '', // Will be set dynamically to ~/Work/brain
  ingestion: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    chunkSize: 1000,
    batchSize: 8,
    concurrency: 3
  },
  embedding: {
    model: 'Xenova/all-MiniLM-L6-v2'
  },
  logging: {
    level: 'info',
    maxFiles: 3,
    maxFileSize: 10 * 1024 * 1024 // 10MB
  }
}

/**
 * Validate a configuration object and return normalized config
 * Fills in missing values with defaults
 */
export function validateConfig(config: unknown): AppConfig {
  if (!config || typeof config !== 'object') {
    return { ...DEFAULT_CONFIG }
  }

  const input = config as Partial<AppConfig>

  return {
    brainDirectory:
      typeof input.brainDirectory === 'string' && input.brainDirectory.length > 0
        ? input.brainDirectory
        : DEFAULT_CONFIG.brainDirectory,

    ingestion: {
      maxFileSize:
        typeof input.ingestion?.maxFileSize === 'number' && input.ingestion.maxFileSize > 0
          ? input.ingestion.maxFileSize
          : DEFAULT_CONFIG.ingestion.maxFileSize,
      chunkSize:
        typeof input.ingestion?.chunkSize === 'number' && input.ingestion.chunkSize > 0
          ? input.ingestion.chunkSize
          : DEFAULT_CONFIG.ingestion.chunkSize,
      batchSize:
        typeof input.ingestion?.batchSize === 'number' && input.ingestion.batchSize > 0
          ? input.ingestion.batchSize
          : DEFAULT_CONFIG.ingestion.batchSize,
      concurrency:
        typeof input.ingestion?.concurrency === 'number' && input.ingestion.concurrency > 0
          ? input.ingestion.concurrency
          : DEFAULT_CONFIG.ingestion.concurrency
    },

    embedding: {
      model:
        typeof input.embedding?.model === 'string' && input.embedding.model.length > 0
          ? input.embedding.model
          : DEFAULT_CONFIG.embedding.model
    },

    logging: {
      level:
        input.logging?.level === 'debug' ||
        input.logging?.level === 'info' ||
        input.logging?.level === 'warn' ||
        input.logging?.level === 'error'
          ? input.logging.level
          : DEFAULT_CONFIG.logging.level,
      maxFiles:
        typeof input.logging?.maxFiles === 'number' && input.logging.maxFiles > 0
          ? input.logging.maxFiles
          : DEFAULT_CONFIG.logging.maxFiles,
      maxFileSize:
        typeof input.logging?.maxFileSize === 'number' && input.logging.maxFileSize > 0
          ? input.logging.maxFileSize
          : DEFAULT_CONFIG.logging.maxFileSize
    }
  }
}

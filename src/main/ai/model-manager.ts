/**
 * Embedding Model Manager
 *
 * Handles checking model download status and downloading models.
 * Models are cached by @xenova/transformers in ~/.cache/huggingface/hub/
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { BrowserWindow } from 'electron'
import { createLogger } from '../../shared/logger'
import { EMBEDDING_MODELS, type EmbeddingModelInfo } from '../models/embedding'

const log = createLogger('main/ai/model-manager')

export interface EmbeddingModelStatus extends EmbeddingModelInfo {
  downloaded: boolean
  downloading: boolean
}

// Track downloading state
const downloadingModels = new Set<string>()

/**
 * Get the Hugging Face cache directory
 */
function getHFCacheDir(): string {
  // Check for custom cache dir environment variable
  const customCache = process.env.HF_HOME || process.env.TRANSFORMERS_CACHE
  if (customCache) {
    return customCache
  }

  // Default location
  return join(homedir(), '.cache', 'huggingface', 'hub')
}

/**
 * Convert model ID to cache directory name
 * e.g., 'Xenova/all-MiniLM-L6-v2' -> 'models--Xenova--all-MiniLM-L6-v2'
 */
function modelIdToCacheName(modelId: string): string {
  return `models--${modelId.replace('/', '--')}`
}

/**
 * Check if a specific model is downloaded
 */
export function isModelDownloaded(modelId: string): boolean {
  const cacheDir = getHFCacheDir()
  const modelCacheDir = join(cacheDir, modelIdToCacheName(modelId))

  // Check if the snapshots directory exists with content
  const snapshotsDir = join(modelCacheDir, 'snapshots')
  if (!existsSync(snapshotsDir)) {
    return false
  }

  // Also check for model files - look for onnx files
  try {
    const modelDir = join(modelCacheDir, 'snapshots')
    if (existsSync(modelDir)) {
      // If snapshots exists and has subdirectories, model is likely downloaded
      return true
    }
  } catch {
    // Ignore errors
  }

  return existsSync(snapshotsDir)
}

/**
 * Get status of all embedding models
 */
export function getEmbeddingModelStatuses(): EmbeddingModelStatus[] {
  return EMBEDDING_MODELS.map((model) => ({
    ...model,
    downloaded: isModelDownloaded(model.id),
    downloading: downloadingModels.has(model.id)
  }))
}

/**
 * Download an embedding model
 * This is done by importing the model with @xenova/transformers
 */
export async function downloadEmbeddingModel(
  modelId: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  log.info('Starting model download', { modelId })

  if (downloadingModels.has(modelId)) {
    throw new Error(`Model ${modelId} is already downloading`)
  }

  // Check if model is in our catalog
  const modelInfo = EMBEDDING_MODELS.find((m) => m.id === modelId)
  if (!modelInfo) {
    throw new Error(`Unknown model: ${modelId}`)
  }

  downloadingModels.add(modelId)

  // Send initial progress
  sendDownloadProgress(modelId, 0, 'starting')

  try {
    // Dynamically import transformers to trigger download
    // The pipeline function will download the model if not cached
    const { pipeline, env } = await import('@xenova/transformers')

    // Configure specific cache directory to ensure we know where it is
    env.cacheDir = getHFCacheDir()
    env.allowLocalModels = false // Force check for updates

    // Create progress callback
    let lastProgress = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progressCallback = (progress: any) => {
      // The progress object structure can vary depending on transformers version and response
      // It usually has { status: string, name: string, file: string, progress?: number, loaded?: number, total?: number }
      
      let percent = 0
      
      if (progress.status === 'progress' && progress.progress !== undefined) {
         percent = Math.round(progress.progress)
      } else if (progress.status === 'progress' && progress.loaded !== undefined && progress.total !== undefined) {
         percent = Math.round((progress.loaded / progress.total) * 100)
      } else if (progress.status === 'initiate') {
         percent = 0
      } else if (progress.status === 'done') {
         percent = 100
      }
      
      const status = progress.status || 'downloading'
      
      // Send updates if percent changed or significant status change
      if (percent !== lastProgress || status !== 'progress') {
        lastProgress = percent
        onProgress?.(percent)
        sendDownloadProgress(modelId, percent, status)
      }
    }

    // Start the pipeline which triggers download
    log.info('Loading model pipeline', { modelId })

    // Create a feature extraction pipeline - this downloads the model
    const extractor = await pipeline('feature-extraction', modelId, {
      progress_callback: progressCallback
    })

    // Dispose of the pipeline after download (we just wanted to download)
    if (typeof (extractor as unknown as { dispose?: () => Promise<void> }).dispose === 'function') {
      await (extractor as unknown as { dispose: () => Promise<void> }).dispose()
    }

    log.info('Model download complete', { modelId })
    // Ensure we send 100% complete at the end
    sendDownloadProgress(modelId, 100, 'complete')
  } catch (error) {
    log.error('Model download failed', { modelId, error })
    sendDownloadProgress(modelId, 0, 'error')
    throw error
  } finally {
    downloadingModels.delete(modelId)
  }
}

/**
 * Send download progress to all renderer windows
 */
function sendDownloadProgress(modelId: string, percent: number, status: string): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('embedding-model-download-progress', {
      modelId,
      percent,
      status
    })
  }
}

/**
 * Check if a model is currently downloading
 */
export function isModelDownloading(modelId: string): boolean {
  return downloadingModels.has(modelId)
}

/**
 * Embedding Model Manager
 *
 * Handles checking model download status and downloading models.
 * Models are cached by @xenova/transformers (Transformers.js) using a filesystem cache.
 *
 * Important: Transformers.js does NOT use the Python HF cache layout (models--.../snapshots).
 * It stores files under keys like: <cacheDir>/<modelId>/<filename>.
 */

import { existsSync, readdirSync, type Dirent } from 'fs'
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
 * Get cache directory for Transformers.js.
 *
 * - If `TRANSFORMERS_CACHE` is set, we use it directly.
 * - Else if `HF_HOME` is set, we use `<HF_HOME>/hub` (matches the conventional HF layout).
 * - Else default to `~/.cache/huggingface/hub`.
 */
export function getTransformersCacheDir(): string {
  const transformersCache = process.env.TRANSFORMERS_CACHE
  if (transformersCache && transformersCache.trim().length > 0) {
    return transformersCache
  }

  const hfHome = process.env.HF_HOME
  if (hfHome && hfHome.trim().length > 0) {
    return join(hfHome, 'hub')
  }

  return join(homedir(), '.cache', 'huggingface', 'hub')
}

/**
 * Python HF hub layout directory name:
 * e.g., 'Xenova/all-MiniLM-L6-v2' -> 'models--Xenova--all-MiniLM-L6-v2'
 */
function modelIdToCacheName(modelId: string): string {
  return `models--${modelId.replace('/', '--')}`
}

function getTransformersJsModelRoot(cacheDir: string, modelId: string): string {
  // Transformers.js FileCache uses keys like `${modelId}/${filename}`.
  // So the directory on disk is `${cacheDir}/${modelId}/...`
  return join(cacheDir, modelId)
}

function hasFileWithExtension(dir: string, extension: string, maxDepth: number): boolean {
  if (maxDepth < 0) return false

  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' }) as unknown as Dirent[]
  } catch {
    return false
  }

  for (const entry of entries) {
    const name = String(entry.name)
    const fullPath = join(dir, name)
    if (entry.isFile() && name.toLowerCase().endsWith(extension)) return true
    if (entry.isDirectory() && hasFileWithExtension(fullPath, extension, maxDepth - 1)) return true
  }

  return false
}

/**
 * Check if a specific model is downloaded
 * Uses multiple detection methods for robustness
 */
export function isModelDownloaded(modelId: string): boolean {
  const cacheDir = getTransformersCacheDir()

  // 1) Transformers.js filesystem cache layout (preferred)
  const transformersJsDir = getTransformersJsModelRoot(cacheDir, modelId)
  log.debug('Checking if model is downloaded', { modelId, cacheDir, transformersJsDir })

  if (existsSync(transformersJsDir)) {
    // Fast-path common artifacts for feature-extraction.
    const candidates = [
      join(transformersJsDir, 'config.json'),
      join(transformersJsDir, 'tokenizer.json'),
      join(transformersJsDir, 'model.onnx'),
      join(transformersJsDir, 'onnx', 'model.onnx'),
      join(transformersJsDir, 'onnx', 'model_quantized.onnx')
    ]
    if (candidates.some(existsSync)) return true

    // Fallback: any onnx file somewhere under the model directory.
    if (hasFileWithExtension(transformersJsDir, '.onnx', 4)) return true
  }

  // 2) Legacy Python HF cache layout (if user manually placed models there)
  const hfModelCacheDir = join(cacheDir, modelIdToCacheName(modelId))
  log.debug('Checking legacy HF cache layout', { modelId, hfModelCacheDir })

  // Check if the model cache directory exists at all
  if (!existsSync(hfModelCacheDir)) {
    log.debug('Model not found in cache', { modelId })
    return false
  }

  // Check for snapshots directory (standard HF cache structure)
  const snapshotsDir = join(hfModelCacheDir, 'snapshots')
  if (existsSync(snapshotsDir)) {
    // Check if snapshots has any content (subdirectories = model versions)
    try {
      const snapshots = readdirSync(snapshotsDir)
      if (snapshots.length > 0) {
        log.debug('Model has snapshots, considering downloaded', { modelId, snapshotCount: snapshots.length })
        return true
      }
    } catch (err) {
      log.warn('Error reading snapshots directory', { hfModelCacheDir, err })
    }
  }

  // Fallback: Check for common model files directly in blobs or refs
  const blobsDir = join(hfModelCacheDir, 'blobs')
  const refsDir = join(hfModelCacheDir, 'refs')
  
  if (existsSync(blobsDir) || existsSync(refsDir)) {
    log.debug('Model has blobs/refs directory, considering downloaded', { modelId })
    return true
  }

  log.debug('Model not found in cache', { modelId })
  return false
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
    env.cacheDir = getTransformersCacheDir()
    env.allowLocalModels = true

    // Create progress callback
    let lastProgress = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progressCallback = (progress: any): void => {
      // The progress object structure can vary depending on transformers version and response
      // It usually has { status: string, name: string, file: string, progress?: number, loaded?: number, total?: number }
      
      let percent = 0
      
      if (progress.status === 'progress' && progress.progress !== undefined) {
         percent = Math.round(progress.progress)
      } else if (
        progress.status === 'progress' &&
        progress.loaded !== undefined &&
        progress.total !== undefined
      ) {
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

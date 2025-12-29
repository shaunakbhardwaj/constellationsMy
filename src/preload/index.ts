import { contextBridge, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppAPI } from '../shared/types'
import { createLogger } from '../shared/logger'

const log = createLogger('preload/api')

log.info('preload module loaded', {
  hasContextBridge: typeof contextBridge?.exposeInMainWorld === 'function',
  hasWebUtils: typeof webUtils?.getPathForFile === 'function'
})

const api: AppAPI = {
  getFilePath: (file) => webUtils.getPathForFile(file),

  getStoredApiKey: async () => {
    try {
      return await electronAPI.ipcRenderer.invoke('llm-get-api-key')
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get stored API key' }
    }
  },
  revealStoredApiKey: async () => {
    try {
      return await electronAPI.ipcRenderer.invoke('llm-reveal-api-key')
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to reveal API key' }
    }
  },
  setApiKey: async (apiKey) => {
    try {
      return await electronAPI.ipcRenderer.invoke('llm-set-api-key', apiKey)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to set API key' }
    }
  },
  clearApiKey: async () => {
    try {
      return await electronAPI.ipcRenderer.invoke('llm-clear-api-key')
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to clear API key' }
    }
  },

  processOntologyDocs: async (filePaths) => {
    try {
      return await electronAPI.ipcRenderer.invoke('ontology-process-docs', filePaths)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to process documents' }
    }
  },
  runOntologyQuery: async (request) => {
    try {
      return await electronAPI.ipcRenderer.invoke('ontology-query', request)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Query failed' }
    }
  },
  clearOntology: async () => {
    try {
      return await electronAPI.ipcRenderer.invoke('ontology-clear')
    } catch (error) {
      return { success: false }
    }
  },
  onOntologyProgress: (callback): (() => void) => {
    const handler = (_event: unknown, progress: unknown) =>
      callback(progress as import('../shared/types').OntologyProgress)
    electronAPI.ipcRenderer.on('ontology-progress', handler)
    return () => electronAPI.ipcRenderer.removeListener('ontology-progress', handler)
  }
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
  log.info('contextBridge exposed globals', { keys: ['electron', 'api'] })
} catch (error) {
  log.error('contextBridge expose failed; attempting direct assignment fallback', { error })
  try {
    ;(globalThis as unknown as { electron?: unknown; api?: unknown }).electron = electronAPI
    ;(globalThis as unknown as { electron?: unknown; api?: unknown }).api = api
    log.info('fallback assignment completed', { keys: ['electron', 'api'] })
  } catch (fallbackError) {
    log.error('fallback assignment failed', { error: fallbackError })
  }
}

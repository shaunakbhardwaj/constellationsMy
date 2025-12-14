import { contextBridge, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { BrainAPI, AppConfig } from '../shared/types'
import { createLogger } from '../shared/logger'

const log = createLogger('preload/api')

log.info('preload module loaded', {
  hasContextBridge: typeof contextBridge?.exposeInMainWorld === 'function',
  hasWebUtils: typeof webUtils?.getPathForFile === 'function'
})

// Custom APIs for renderer
const api: BrainAPI = {
  importFiles: async (request) => {
    log.info('ipcRenderer.invoke(import-files) start', request)
    const startedAt = Date.now()
    try {
      const response = await electronAPI.ipcRenderer.invoke('import-files', request)
      log.info('ipcRenderer.invoke(import-files) done', { durationMs: Date.now() - startedAt, response })
      return response
    } catch (error) {
      log.error('ipcRenderer.invoke(import-files) failed', { durationMs: Date.now() - startedAt, error })
      throw error
    }
  },
  fetchBrainData: async () => {
    log.info('ipcRenderer.invoke(fetch-brain-data) start')
    const startedAt = Date.now()
    try {
      const response = await electronAPI.ipcRenderer.invoke('fetch-brain-data')
      log.info('ipcRenderer.invoke(fetch-brain-data) done', { durationMs: Date.now() - startedAt, response })
      return response
    } catch (error) {
      log.error('ipcRenderer.invoke(fetch-brain-data) failed', { durationMs: Date.now() - startedAt, error })
      throw error
    }
  },
  searchBrain: async (query) => {
    log.info('ipcRenderer.invoke(search-brain) start', { queryLength: query?.length })
    const startedAt = Date.now()
    try {
      const response = await electronAPI.ipcRenderer.invoke('search-brain', query)
      log.info('ipcRenderer.invoke(search-brain) done', { durationMs: Date.now() - startedAt, response })
      return response
    } catch (error) {
      log.error('ipcRenderer.invoke(search-brain) failed', { durationMs: Date.now() - startedAt, error })
      throw error
    }
  },
  getFilePath: (file) => webUtils.getPathForFile(file),

  // Configuration API
  getConfig: async () => {
    log.info('ipcRenderer.invoke(get-config) start')
    const startedAt = Date.now()
    try {
      const response = await electronAPI.ipcRenderer.invoke('get-config')
      log.info('ipcRenderer.invoke(get-config) done', { durationMs: Date.now() - startedAt })
      return response
    } catch (error) {
      log.error('ipcRenderer.invoke(get-config) failed', { durationMs: Date.now() - startedAt, error })
      throw error
    }
  },
  setConfig: async (config: Partial<AppConfig>) => {
    log.info('ipcRenderer.invoke(set-config) start', { keys: Object.keys(config) })
    const startedAt = Date.now()
    try {
      const response = await electronAPI.ipcRenderer.invoke('set-config', config)
      log.info('ipcRenderer.invoke(set-config) done', { durationMs: Date.now() - startedAt })
      return response
    } catch (error) {
      log.error('ipcRenderer.invoke(set-config) failed', { durationMs: Date.now() - startedAt, error })
      throw error
    }
  },
  resetConfig: async () => {
    log.info('ipcRenderer.invoke(reset-config) start')
    const startedAt = Date.now()
    try {
      const response = await electronAPI.ipcRenderer.invoke('reset-config')
      log.info('ipcRenderer.invoke(reset-config) done', { durationMs: Date.now() - startedAt })
      return response
    } catch (error) {
      log.error('ipcRenderer.invoke(reset-config) failed', { durationMs: Date.now() - startedAt, error })
      throw error
    }
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

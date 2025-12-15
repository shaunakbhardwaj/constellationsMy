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
  },

  // Goals API
  getGoals: async () => {
    try {
      return await electronAPI.ipcRenderer.invoke('get-goals')
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get goals' }
    }
  },
  createGoal: async (request) => {
    try {
      return await electronAPI.ipcRenderer.invoke('create-goal', request)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create goal' }
    }
  },
  updateGoal: async (id, updates) => {
    try {
      return await electronAPI.ipcRenderer.invoke('update-goal', id, updates)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update goal' }
    }
  },
  deleteGoal: async (id) => {
    try {
      return await electronAPI.ipcRenderer.invoke('delete-goal', id)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete goal' }
    }
  },
  toggleGoalComplete: async (id) => {
    try {
      return await electronAPI.ipcRenderer.invoke('toggle-goal-complete', id)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle goal' }
    }
  },

  // Agent API
  getAgentState: async () => {
    try {
      return await electronAPI.ipcRenderer.invoke('agent-get-state')
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get agent state' }
    }
  },
  startAgent: async (goalId) => {
    try {
      return await electronAPI.ipcRenderer.invoke('agent-start', goalId)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to start agent' }
    }
  },
  pauseAgent: async () => {
    try {
      return await electronAPI.ipcRenderer.invoke('agent-pause')
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to pause agent' }
    }
  },
  resumeAgent: async () => {
    try {
      return await electronAPI.ipcRenderer.invoke('agent-resume')
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to resume agent' }
    }
  },
  stopAgent: async () => {
    try {
      return await electronAPI.ipcRenderer.invoke('agent-stop')
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to stop agent' }
    }
  },
  sendAgentGuidance: async (guidance) => {
    try {
      return await electronAPI.ipcRenderer.invoke('agent-guidance', guidance)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to send guidance' }
    }
  },
  onAgentStateChange: (callback) => {
    const handler = (_event: unknown, state: unknown) => callback(state as import('../shared/types').AgentState)
    electronAPI.ipcRenderer.on('agent-state-update', handler)
    return () => electronAPI.ipcRenderer.removeListener('agent-state-update', handler)
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

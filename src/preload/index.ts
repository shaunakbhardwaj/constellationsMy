import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
    source: {
        ingestText: (params: any) => ipcRenderer.invoke('source:ingest-text', params),
        ingestPdf: (params: any) => ipcRenderer.invoke('source:ingest-pdf', params),
    },
    map: {
        generateCompression: (params: any) => ipcRenderer.invoke('map:generate-compression', params),
        expandNodeWithLens: (params: any) => ipcRenderer.invoke('map:expand-node-with-lens', params),
    },
    artifact: {
        createBranchBrief: (params: any) => ipcRenderer.invoke('artifact:create-branch-brief', params),
        listByDocument: (compressionMapId: string) => ipcRenderer.invoke('artifact:list-by-document', { compressionMapId }),
    },
    handoff: {
        dispatchToCodex: (params: any) => ipcRenderer.invoke('handoff:dispatch-to-codex', params),
    },
    log: {
        event: (params: any) => ipcRenderer.invoke('log:event', params),
        recent: (limit?: number) => ipcRenderer.invoke('log:recent', { limit }),
        recentLLM: (limit?: number) => ipcRenderer.invoke('log:recent-llm', { limit }),
    },
    memory: {
        list: () => ipcRenderer.invoke('memory:list'),
        get: (id: string) => ipcRenderer.invoke('memory:get', { id }),
        create: (params: any) => ipcRenderer.invoke('memory:create', params),
        update: (params: any) => ipcRenderer.invoke('memory:update', params),
        delete: (id: string) => ipcRenderer.invoke('memory:delete', { id }),
    }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('api', api)
    } catch (error) {
        console.error(error)
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI
    // @ts-ignore (define in dts)
    window.api = api
}

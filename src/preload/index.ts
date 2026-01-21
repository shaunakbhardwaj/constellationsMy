import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
    generateMindmap: (params: any) => ipcRenderer.invoke('generate-mindmap', params),
    expandNode: (params: any) => ipcRenderer.invoke('expand-node', params),
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

import { contextBridge, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type FileTransferResponse = {
  success: boolean
  files?: { source: string; destination: string }[]
  error?: string
}

type BrainFileRow = {
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

type BrainDataResponse = {
  success: boolean
  files?: BrainFileRow[]
  error?: string
}

type SearchResult = {
  fileId: string
  fileName: string
  text: string
  score: number
  chunkIndex: number
  isIndexed: boolean
}

type SearchResponse = {
  success: boolean
  results?: SearchResult[]
  error?: string
}

// Custom APIs for renderer
const api = {
  importFiles: (paths: string[]): Promise<FileTransferResponse> => {
    return electronAPI.ipcRenderer.invoke('import-files', paths)
  },
  fetchBrainData: (): Promise<BrainDataResponse> => {
    return electronAPI.ipcRenderer.invoke('fetch-brain-data')
  },
  searchBrain: (query: string): Promise<SearchResponse> => {
    return electronAPI.ipcRenderer.invoke('search-brain', query)
  },
  getFilePath: (file: File): string => {
    return webUtils.getPathForFile(file)
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

/// <reference types="vite/client" />

import type { ElectronAPI } from '@electron-toolkit/preload'

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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      importFiles: (paths: string[]) => Promise<FileTransferResponse>
      fetchBrainData: () => Promise<BrainDataResponse>
      searchBrain: (query: string) => Promise<SearchResponse>
      getFilePath: (file: File) => string
    }
  }
}

export {}

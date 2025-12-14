import { useCallback, useEffect, useRef, useState } from 'react'
import GalaxyCanvas from './components/GalaxyCanvas'
import type { BrainFileRow, SearchResult } from '../../shared/types'
import { createLogger } from '../../shared/logger'

type DropState = 'idle' | 'hover' | 'uploading' | 'success' | 'error'

const statusLabels: Record<DropState, string> = {
  idle: 'literally nothing happening',
  hover: 'okay just drop it',
  uploading: 'hold on... maybe working',
  success: 'somehow worked',
  error: 'yikes try again'
}

const formatTimestamp = (timestamp: number): string =>
  new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(timestamp)

type FileWithPath = File & { path?: string }

const log = createLogger('renderer/dnd')

const extractFilePaths = (dataTransfer: DataTransfer): string[] => {
  log.info('extractFilePaths start', {
    dataTransferTypes: Array.from(dataTransfer.types ?? []),
    fileCount: dataTransfer.files?.length ?? 0,
    files: Array.from(dataTransfer.files ?? []).map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type
    }))
  })

  const fromFileList = Array.from(dataTransfer.files)
    .map((file) => {
      try {
        return window.api.getFilePath(file)
      } catch (error) {
        log.warn('getFilePath failed; falling back to File.path', { error, fileName: file.name })
        return (file as FileWithPath).path
      }
    })
    .filter((path): path is string => Boolean(path && path.trim()))

  if (fromFileList.length > 0) {
    log.info('extractFilePaths result from FileList', { paths: fromFileList })
    return fromFileList
  }

  const isWindows = navigator.userAgent.toLowerCase().includes('windows')
  const normalizePath = (raw: string | null | undefined): string | null => {
    if (!raw) return null
    let candidate = raw.trim()
    if (!candidate) return null

    if (candidate.startsWith('file://')) {
      candidate = candidate.replace('file://', '')
    }

    try {
      candidate = decodeURI(candidate)
    } catch {
      // If decoding fails we fall back to the raw string.
    }

    if (isWindows && candidate.startsWith('/')) {
      candidate = candidate.slice(1)
    }

    return candidate.length > 0 ? candidate : null
  }

  const hydrateFromUriList = (): string[] => {
    const uriList = dataTransfer.getData('text/uri-list')
    if (!uriList) return []

    return uriList
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((uri) => {
        try {
          const parsed = new URL(uri)
          if (parsed.protocol !== 'file:') return null
          let filePath = decodeURI(parsed.pathname)
          if (isWindows && filePath.startsWith('/')) {
            filePath = filePath.slice(1)
          }
          return filePath
        } catch {
          return normalizePath(uri)
        }
      })
      .filter((path): path is string => Boolean(path && path.trim()))
  }

  const hydrateFromPlainText = (): string[] => {
    const plain = dataTransfer.getData('text/plain')
    if (!plain) return []

    return plain
      .split(/\r?\n/)
      .map((line) => normalizePath(line))
      .filter((path): path is string => Boolean(path && path.trim()))
  }

  const fallbackPaths = [...hydrateFromUriList(), ...hydrateFromPlainText()]
  const deduped = Array.from(new Set(fallbackPaths))
  log.info('extractFilePaths result from fallbacks', { fallbackPaths, deduped })
  return deduped
}

const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined) return 'N/A'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const size = bytes / Math.pow(1024, index)
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`
}

const formatDate = (timestamp: number | null | undefined): string => {
  if (!timestamp) return 'N/A'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(timestamp)
}

function App(): React.JSX.Element {
  const [dropState, setDropState] = useState<DropState>('idle')
  const [statusMessage, setStatusMessage] = useState('There is literally nothing here yet.')
  const [isDataVisible, setIsDataVisible] = useState(false)
  const [dataRows, setDataRows] = useState<BrainFileRow[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    if (dropState === 'success' || dropState === 'error') {
      const timeout = setTimeout(() => setDropState('idle'), 3200)
      return () => clearTimeout(timeout)
    }
    return undefined
  }, [dropState])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setSearchError(null)

    try {
      const response = await window.api.searchBrain(searchQuery)

      if (!response.success || !response.results) {
        throw new Error(response.error ?? 'Search failed')
      }

      setSearchResults(response.results)
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search failed')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery])

  const handleSearchKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleSearch()
      }
    },
    [handleSearch]
  )

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current += 1
    setDropState((prev) => (prev === 'uploading' ? prev : 'hover'))
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) {
      setDropState((prev) => (prev === 'uploading' ? prev : 'idle'))
    }
  }, [])

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    const requestId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `req-${Date.now()}`
    log.info('drop received', {
      requestId,
      dataTransferTypes: Array.from(event.dataTransfer.types ?? []),
      fileCount: event.dataTransfer.files?.length ?? 0
    })
    const filePaths = extractFilePaths(event.dataTransfer)

    if (!filePaths.length) {
      log.warn('drop had zero extracted paths', { requestId })
      setDropState('error')
      setStatusMessage("Electron didn't see anything. Tough crowd.")
      return
    }

    setDropState('uploading')
    setStatusMessage('Pretending to work on it...')

    try {
      log.info('calling api.importFiles', { requestId, pathsCount: filePaths.length, paths: filePaths })
      const startedAt = Date.now()
      const response = await window.api.importFiles({ requestId, paths: filePaths, source: 'drag-drop' })
      log.info('api.importFiles returned', { requestId, durationMs: Date.now() - startedAt, response })

      if (!response.success || !response.files) {
        throw new Error(response.error ?? 'Unknown import failure.')
      }

      const files = response.files
      const timestamp = Date.now()
      setDropState('success')
      setStatusMessage(`Dropped ${files.length} thing${files.length === 1 ? '' : 's'} at ${formatTimestamp(timestamp)}.`)
    } catch (error) {
      log.error('api.importFiles threw', { requestId, error })
      setDropState('error')
      setStatusMessage(error instanceof Error ? error.message : 'Something weird happened.')
    }
  }, [])

  const fetchBrainData = useCallback(async () => {
    setDataLoading(true)
    setDataError(null)
    try {
      const response = await window.api.fetchBrainData()
      if (!response.success || !response.files) {
        throw new Error(response.error ?? 'No idea what went wrong, try again?')
      }
      setDataRows(response.files)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Something weird happened.')
    } finally {
      setDataLoading(false)
    }
  }, [])

  const handleViewDataClick = useCallback(() => {
    setIsDataVisible(true)
    void fetchBrainData()
  }, [fetchBrainData])

  const handleCloseDataPanel = useCallback(() => {
    setIsDataVisible(false)
  }, [])

  const handleRefreshData = useCallback(() => {
    void fetchBrainData()
  }, [fetchBrainData])

  return (
    <main className="lonely-page">
      <GalaxyCanvas />
      <div className="panel-stack">
        <div className="search-panel">
          <input
            type="text"
            className="search-input"
            placeholder="Ask your brain anything..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleSearchKeyPress}
            disabled={isSearching}
          />
          <button
            type="button"
            className="search-button"
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
          >
            {isSearching ? 'Thinking...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="results-panel">
            <p className="results-header">
              Found {searchResults.length} result{searchResults.length === 1 ? '' : 's'}
            </p>
            <div className="results-list">
              {searchResults.map((result) => (
                <div key={`${result.fileId}-${result.chunkIndex}`} className="result-item">
                  <div className="result-meta">
                    <span className="result-filename">{result.fileName}</span>
                    <span className="result-score">{(1 - result.score).toFixed(3)} match</span>
                  </div>
                  <p className="result-text">{result.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchError && <p className="search-error">{searchError}</p>}

        <div
          className={`drop-box state-${dropState}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <p className="box-title">Drag stuff here</p>
          <p className="box-status">{statusLabels[dropState]}</p>
          <p className="box-message">{statusMessage}</p>
          <p className="box-hint">Destination: ~/Work/brain</p>
        </div>
        <button
          type="button"
          className="view-data-button"
          onClick={handleViewDataClick}
          disabled={dataLoading && !isDataVisible}
        >
          {dataLoading && !isDataVisible ? 'Loading...' : 'View Data'}
        </button>
        {isDataVisible && (
          <section className="data-panel">
            <div className="data-panel-header">
              <div>
                <p className="panel-title">Brain Files</p>
                <p className="panel-subtitle">
                  {dataLoading ? 'Fetching latest snapshot...' : `${dataRows.length} item${dataRows.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="panel-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleRefreshData}
                  disabled={dataLoading}
                >
                  {dataLoading ? 'Refreshing...' : 'Refresh'}
                </button>
                <button type="button" className="ghost-button" onClick={handleCloseDataPanel}>
                  Close
                </button>
              </div>
            </div>
            {dataError && <p className="data-error">{dataError}</p>}
            <div className="data-table-wrapper">
              {dataRows.length === 0 && !dataLoading && !dataError ? (
                <p className="data-empty">Nothing logged yet. Drop something in to get started.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th>Type</th>
                      <th>MIME</th>
                      <th>Size</th>
                      <th>Created</th>
                      <th>Indexed</th>
                      <th>Status</th>
                      <th>Chunks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((row) => (
                      <tr key={row.id}>
                        <td className="path-cell" title={row.path}>
                          {row.relativePath}
                        </td>
                        <td>{row.type}</td>
                        <td className="muted-cell">{row.mimeType ?? 'N/A'}</td>
                        <td>{formatBytes(row.sizeBytes)}</td>
                        <td>{formatDate(row.createdAt)}</td>
                        <td>{formatDate(row.lastIndexedAt)}</td>
                        <td className="status-cell">{row.indexedStatus ?? 'pending'}</td>
                        <td className="numeric-cell">{row.chunkCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

export default App

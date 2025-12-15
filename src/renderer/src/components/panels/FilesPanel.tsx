import React, { useState, useCallback, useEffect, useRef } from 'react'
import { UploadIcon, getFileIcon, RefreshIcon, TrashIcon } from '../Icons'
import type { BrainFileRow } from '../../../../shared/types'

type DropState = 'idle' | 'hover' | 'uploading' | 'success' | 'error'

type FileWithPath = File & { path?: string }

const extractFilePaths = (dataTransfer: DataTransfer): string[] => {
    const fromFileList = Array.from(dataTransfer.files)
        .map((file) => {
            try {
                return window.api.getFilePath(file)
            } catch (error) {
                console.warn('getFilePath failed; falling back to File.path', { error, fileName: file.name })
                return (file as FileWithPath).path
            }
        })
        .filter((path): path is string => Boolean(path && path.trim()))

    if (fromFileList.length > 0) {
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
    return Array.from(new Set(fallbackPaths))
}

const formatBytes = (bytes: number | null | undefined): string => {
    if (bytes === null || bytes === undefined) return 'N/A'
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const size = bytes / Math.pow(1024, index)
    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`
}

export function FilesPanel(): React.JSX.Element {
    const [dropState, setDropState] = useState<DropState>('idle')
    const [dropMessage, setDropMessage] = useState('')
    const [dataRows, setDataRows] = useState<BrainFileRow[]>([])
    const [dataLoading, setDataLoading] = useState(true)
    const [dataError, setDataError] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<BrainFileRow | null>(null)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const dragDepth = useRef(0)

    // Reset drop state after success/error
    useEffect(() => {
        if (dropState === 'success' || dropState === 'error') {
            const timeout = setTimeout(() => {
                setDropState('idle')
                setDropMessage('')
            }, 3000)
            return () => clearTimeout(timeout)
        }
        return undefined
    }, [dropState])

    const fetchData = useCallback(async () => {
        setDataLoading(true)
        setDataError(null)
        try {
            const response = await window.api.fetchBrainData()
            if (!response.success || !response.files) {
                throw new Error(response.error ?? 'Failed to fetch files')
            }
            setDataRows(response.files)
        } catch (error) {
            setDataError(error instanceof Error ? error.message : 'Failed to fetch files')
        } finally {
            setDataLoading(false)
        }
    }, [])

    // Load data on mount
    useEffect(() => {
        void fetchData()
    }, [fetchData])

    useEffect(() => {
        if (!deleteTarget) return undefined

        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                setDeleteTarget(null)
                setDeleteError(null)
            }
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [deleteTarget])

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

    const handleDrop = useCallback(
        async (event: React.DragEvent<HTMLDivElement>) => {
            event.preventDefault()
            dragDepth.current = 0
            const requestId = globalThis.crypto?.randomUUID
                ? globalThis.crypto.randomUUID()
                : `req-${Date.now()}`

            const filePaths = extractFilePaths(event.dataTransfer)

            if (!filePaths.length) {
                setDropState('error')
                setDropMessage('No valid files detected')
                return
            }

            setDropState('uploading')
            setDropMessage(`Importing ${filePaths.length} file${filePaths.length === 1 ? '' : 's'}...`)

            try {
                const response = await window.api.importFiles({
                    requestId,
                    paths: filePaths,
                    source: 'drag-drop'
                })

                if (!response.success || !response.files) {
                    throw new Error(response.error ?? 'Import failed')
                }

                setDropState('success')
                setDropMessage(
                    `Successfully imported ${response.files.length} file${response.files.length === 1 ? '' : 's'}`
                )
                // Refresh the file list
                void fetchData()
            } catch (error) {
                setDropState('error')
                setDropMessage(error instanceof Error ? error.message : 'Import failed')
            }
        },
        [fetchData]
    )

    const handlePathClick = useCallback((path: string) => {
        // In a real implementation, this would reveal the file in Finder/Explorer
        console.log('Reveal in Finder:', path)
    }, [])

    const handleDeleteClick = useCallback((row: BrainFileRow) => {
        setDeleteError(null)
        setDeleteTarget(row)
    }, [])

    const handleConfirmDelete = useCallback(async () => {
        if (!deleteTarget) return

        setDeleteLoading(true)
        setDeleteError(null)
        try {
            const response = await window.api.deleteFile(deleteTarget.id)
            if (!response.success) {
                throw new Error(response.error ?? 'Failed to delete file')
            }
            setDeleteTarget(null)
            void fetchData()
        } catch (error) {
            setDeleteError(error instanceof Error ? error.message : 'Failed to delete file')
        } finally {
            setDeleteLoading(false)
        }
    }, [deleteTarget, fetchData])

    return (
        <div className="panel active" id="files">
            <div className="page-header">
                <h1 className="page-title">Files</h1>
                <p className="page-subtitle">Add and manage your knowledge base</p>
            </div>

            <div
                className={`drop-zone ${dropState}`}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className="drop-icon">
                    <UploadIcon />
                </div>
                <div className="drop-title">
                    {dropState === 'idle' && 'Drop files here'}
                    {dropState === 'hover' && 'Release to upload'}
                    {dropState === 'uploading' && 'Uploading...'}
                    {dropState === 'success' && 'Success!'}
                    {dropState === 'error' && 'Error'}
                </div>
                <div className="drop-subtitle">
                    {dropState === 'idle' && 'PDF, Markdown, code files, and more'}
                    {dropMessage && <span className="drop-message">{dropMessage}</span>}
                </div>
            </div>

            <div className="data-card">
                <div className="data-header">
                    <span className="data-title">All Files</span>
                    <div className="data-actions">
                        <span className="data-count">
                            {dataLoading ? 'Loading...' : `${dataRows.length} file${dataRows.length === 1 ? '' : 's'}`}
                        </span>
                        <button className="btn-ghost" onClick={fetchData} disabled={dataLoading} type="button">
                            <RefreshIcon />
                        </button>
                    </div>
                </div>

                {dataError && <div className="search-error">{dataError}</div>}

                {dataRows.length === 0 && !dataLoading && !dataError ? (
                    <div className="data-empty">No files yet. Drop some files above to get started.</div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>File</th>
                                <th>Model</th>
                                <th>Chunks</th>
                                <th>Size</th>
                                <th>Status</th>
                                <th className="file-actions-header">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataRows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <div className="file-cell">
                                            <div className="file-icon-sm">{getFileIcon(row.relativePath)}</div>
                                            <div>
                                                <div className="file-name">{row.relativePath.split('/').pop()}</div>
                                                <div className="file-path" onClick={() => handlePathClick(row.path)}>
                                                    {row.relativePath}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="mono">all-MiniLM-L6-v2</td>
                                    <td className="mono">{row.chunkCount}</td>
                                    <td className="mono">{formatBytes(row.sizeBytes)}</td>
                                    <td>
                                        <span className={`status-badge ${row.indexedStatus ?? 'pending'}`}>
                                            {row.indexedStatus === 'indexed'
                                                ? 'Indexed'
                                                : row.indexedStatus === 'processing'
                                                    ? 'Processing'
                                                    : row.indexedStatus === 'error'
                                                        ? 'Error'
                                                        : 'Pending'}
                                        </span>
                                    </td>
                                    <td className="file-actions-cell">
                                        <button
                                            className="icon-btn danger"
                                            onClick={() => handleDeleteClick(row)}
                                            disabled={row.indexedStatus === 'processing'}
                                            type="button"
                                            aria-label={`Delete ${row.relativePath}`}
                                            title={
                                                row.indexedStatus === 'processing'
                                                    ? 'Cannot delete while indexing'
                                                    : 'Delete file'
                                            }
                                        >
                                            <TrashIcon />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {deleteTarget && (
                <div
                    className="modal-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Delete file confirmation"
                    onClick={() => {
                        if (!deleteLoading) {
                            setDeleteTarget(null)
                            setDeleteError(null)
                        }
                    }}
                >
                    <div className="modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-title">
                            Delete &quot;{deleteTarget.relativePath.split('/').pop() ?? deleteTarget.relativePath}
                            &quot;?
                        </div>
                        <div className="modal-body">
                            This will permanently remove the file and all its indexed data from the brain.
                        </div>
                        {deleteError && <div className="modal-error">{deleteError}</div>}
                        <div className="modal-actions">
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    setDeleteTarget(null)
                                    setDeleteError(null)
                                }}
                                disabled={deleteLoading}
                                type="button"
                            >
                                Cancel
                            </button>
                            <button
                                className="btn-danger"
                                onClick={handleConfirmDelete}
                                disabled={deleteLoading}
                                type="button"
                            >
                                {deleteLoading ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default FilesPanel

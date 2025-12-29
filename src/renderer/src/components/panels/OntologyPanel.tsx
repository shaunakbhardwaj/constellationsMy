import React, { useState, useCallback, useRef, useEffect } from 'react'
import { SearchIcon } from '../Icons'
import type { OntologyResult, OntologyProgress } from '../../../../shared/types'
import { formatLLMResponse } from '../../utils/llmFormat'

/**
 * Result card for displaying chunks
 */
function ResultCard({
    result,
    title
}: {
    result: OntologyResult | null
    title: string
}): React.JSX.Element {
    if (!result) {
        return (
            <div className="ontology-result-card empty">
                <h3>{title}</h3>
                <p className="empty-message">Run a query to see results</p>
            </div>
        )
    }

    return (
        <div className="ontology-result-card">
            <div className="result-header">
                <h3>{title}</h3>
                <span className="latency-badge">{result.latencyMs}ms</span>
            </div>

            <div className="chunks-list">
                {result.chunks.map((chunk, i) => (
                    <div key={i} className="chunk-item">
                        <div className="chunk-meta">
                            <span className="chunk-score">{(chunk.score * 100).toFixed(0)}%</span>
                            {chunk.entityPath && chunk.entityPath.length > 0 && (
                                <span className="entity-path">
                                    via: {chunk.entityPath.join(' → ')}
                                </span>
                            )}
                        </div>
                        <p className="chunk-text">{chunk.text.slice(0, 200)}...</p>
                    </div>
                ))}
            </div>

            {result.answer && (
                <div className="answer-section">
                    <h4>Answer</h4>
                    <div className="answer-body">{formatLLMResponse(result.answer)}</div>
                </div>
            )}
        </div>
    )
}

/**
 * Loading spinner component
 */
function LoadingSpinner({ message }: { message: string }): React.JSX.Element {
    return (
        <div className="loading-spinner-container">
            <div className="loading-spinner" />
            <span className="loading-message">{message}</span>
        </div>
    )
}

export function OntologyPanel(): React.JSX.Element {
    const [apiKey, setApiKey] = useState('')
    const [hasStoredKey, setHasStoredKey] = useState(false)
    const [maskedStoredKey, setMaskedStoredKey] = useState('')
    const [revealedKey, setRevealedKey] = useState('')
    const [isRevealed, setIsRevealed] = useState(false)
    const [saveNotice, setSaveNotice] = useState<'saved' | 'cleared' | null>(null)
    const [selectedModel, setSelectedModel] = useState('deepseek/deepseek-r1-0528:free')
    const [models] = useState([
        { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2' },
        { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1' },
        { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder' },
        { id: 'openai/gpt-oss-120b:free', name: 'GPT OSS 120B' },
        { id: 'mistralai/devstral-2512:free', name: 'Devstral' }
    ])

    const [query, setQuery] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isProcessingDocs, setIsProcessingDocs] = useState(false)
    const [processingProgress, setProcessingProgress] = useState<OntologyProgress | null>(null)
    const [error, setError] = useState<string | null>(null)

    const [result, setResult] = useState<OntologyResult | null>(null)

    const [fileNames, setFileNames] = useState<string[]>([])
    const [docsProcessed, setDocsProcessed] = useState(false)
    const [chunkCount, setChunkCount] = useState(0)
    const dropZoneRef = useRef<HTMLDivElement>(null)

    // Subscribe to progress events
    useEffect(() => {
        const unsubscribe = window.api.onOntologyProgress((progress) => {
            setProcessingProgress(progress)
        })
        return unsubscribe
    }, [])

    useEffect(() => {
        const loadStoredKey = async () => {
            const response = await window.api.getStoredApiKey()
            if (response.success) {
                setHasStoredKey(Boolean(response.hasKey))
                setMaskedStoredKey(response.maskedKey ?? '')
            }
        }
        void loadStoredKey()
    }, [])

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setError(null)

        const paths: string[] = []
        const names: string[] = []

        if (e.dataTransfer.files) {
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                const file = e.dataTransfer.files[i]
                const filePath = window.api.getFilePath(file)
                paths.push(filePath)
                names.push(file.name)
            }
        }

        if (paths.length === 0) return

        setFileNames(names)
        setIsProcessingDocs(true)
        setDocsProcessed(false)
        setChunkCount(0)

        const response = await window.api.processOntologyDocs(paths)

        setIsProcessingDocs(false)
        setProcessingProgress(null)

        if (response.success) {
            setDocsProcessed(true)
            setChunkCount(response.chunkCount ?? 0)
        } else {
            setError(response.error ?? 'Failed to process documents')
        }
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }, [])

    const handleClear = useCallback(async () => {
        await window.api.clearOntology()
        setFileNames([])
        setDocsProcessed(false)
        setChunkCount(0)
        setResult(null)
        setError(null)
    }, [])

    const handleQuery = useCallback(async () => {
        if (!query.trim() || (!apiKey.trim() && !hasStoredKey)) return

        if (!docsProcessed) {
            setError('Please drop some documents first')
            return
        }

        setIsLoading(true)
        setError(null)
        setResult(null)

        const response = await window.api.runOntologyQuery({
            query: query.trim(),
            apiKey: apiKey.trim(),
            model: selectedModel
        })

        setIsLoading(false)

        if (response.success) {
            if (response.result) {
                setResult(response.result)
            }
        } else {
            setError(response.error ?? 'Query failed')
        }
    }, [query, apiKey, selectedModel, docsProcessed, hasStoredKey])

    const handleSaveApiKey = useCallback(async () => {
        const key = apiKey.trim()
        if (!key) return
        const response = await window.api.setApiKey(key)
        if (response.success) {
            setApiKey('')
            setIsRevealed(false)
            setRevealedKey('')
            const stored = await window.api.getStoredApiKey()
            if (stored.success) {
                setHasStoredKey(Boolean(stored.hasKey))
                setMaskedStoredKey(stored.maskedKey ?? '')
            }
            setSaveNotice('saved')
            setTimeout(() => setSaveNotice(null), 2000)
        } else {
            setError(response.error ?? 'Failed to save API key')
        }
    }, [apiKey])

    const handleClearApiKey = useCallback(async () => {
        const response = await window.api.clearApiKey()
        if (response.success) {
            setHasStoredKey(false)
            setMaskedStoredKey('')
            setIsRevealed(false)
            setRevealedKey('')
            setSaveNotice('cleared')
            setTimeout(() => setSaveNotice(null), 2000)
        } else {
            setError(response.error ?? 'Failed to clear API key')
        }
    }, [])

    const handleToggleReveal = useCallback(async () => {
        if (!hasStoredKey) return
        if (isRevealed) {
            setIsRevealed(false)
            setRevealedKey('')
            return
        }
        const response = await window.api.revealStoredApiKey()
        if (response.success && response.hasKey) {
            setRevealedKey(response.apiKey ?? '')
            setIsRevealed(true)
        } else {
            setError(response.error ?? 'Failed to reveal API key')
        }
    }, [hasStoredKey, isRevealed])

    return (
        <div className="panel ontology-panel active" id="ontology">
            <div className="page-header">
                <h1 className="page-title">Ontology</h1>
                <p className="page-subtitle">Ask questions and see ontology-grounded answers</p>
            </div>

            <div className="ontology-config">
                <div className="config-row">
                    <div className="config-field">
                        <label>OpenRouter API Key</label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={hasStoredKey ? maskedStoredKey : 'sk-or-...'}
                            className="config-input"
                        />
                        <div className="config-key-actions">
                            <button
                                type="button"
                                className="btn-ghost"
                                onClick={handleSaveApiKey}
                                disabled={!apiKey.trim()}
                            >
                                Save key
                            </button>
                            {hasStoredKey && (
                                <>
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        onClick={handleToggleReveal}
                                    >
                                        {isRevealed ? 'Hide key' : 'View key'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        onClick={handleClearApiKey}
                                    >
                                        Clear saved key
                                    </button>
                                </>
                            )}
                        </div>
                        {hasStoredKey && !apiKey.trim() && (
                            <p className="config-hint">
                                Saved key: {maskedStoredKey}. It will be used unless you enter a new one.
                            </p>
                        )}
                        {isRevealed && revealedKey && (
                            <div className="config-reveal">
                                <span>Saved key</span>
                                <code>{revealedKey}</code>
                            </div>
                        )}
                        {saveNotice === 'saved' && (
                            <div className="config-flash success">API key saved.</div>
                        )}
                        {saveNotice === 'cleared' && (
                            <div className="config-flash neutral">Saved key cleared.</div>
                        )}
                    </div>
                    <div className="config-field">
                        <label>Model</label>
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="config-select"
                        >
                            {models.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div
                ref={dropZoneRef}
                className={`file-drop-zone ${isProcessingDocs ? 'processing' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                {isProcessingDocs ? (
                    <LoadingSpinner
                        message={processingProgress
                            ? `${processingProgress.phase === 'reading' ? 'Reading' : 'Embedding'} ${processingProgress.current}/${processingProgress.total}...`
                            : 'Processing documents...'
                        }
                    />
                ) : fileNames.length === 0 ? (
                    <p>Drop files here (PDF, TXT, MD)</p>
                ) : (
                    <div className="dropped-files">
                        <span>
                            {docsProcessed
                                ? `${fileNames.length} file(s) processed (${chunkCount} chunks)`
                                : `${fileNames.length} file(s) ready`
                            }
                        </span>
                        <button
                            type="button"
                            className="btn-ghost"
                            onClick={handleClear}
                        >
                            Clear
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div className="ontology-error">
                    <p>{error}</p>
                </div>
            )}

            <div className="query-section">
                <div className="query-input-wrapper">
                    <SearchIcon />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ask a question about your documents..."
                        className="query-input"
                        onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                    />
                    <button
                        type="button"
                        className="query-button"
                        onClick={handleQuery}
                        disabled={isLoading || !query.trim() || (!apiKey.trim() && !hasStoredKey) || !docsProcessed}
                    >
                        {isLoading ? 'Running...' : 'Ask'}
                    </button>
                </div>
            </div>

            {isLoading && (
                <div className="query-loading">
                    <LoadingSpinner message="Querying ontology..." />
                </div>
            )}

            <div className="result-container">
                <div className="result-column">
                    <ResultCard result={result} title="Ontology Output" />
                </div>
            </div>
        </div>
    )
}

export default OntologyPanel

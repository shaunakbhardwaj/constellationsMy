import React, { useState, useCallback, useRef, useEffect } from 'react'
import { SearchIcon } from '../Icons'
import type { ExperimentComparisonResult, ExperimentProgress } from '../../../../shared/types'
import { formatLLMResponse } from '../../utils/llmFormat'

/**
 * Toggle switch component
 */
function Toggle({
    enabled,
    onChange,
    label
}: {
    enabled: boolean
    onChange: (enabled: boolean) => void
    label: string
}): React.JSX.Element {
    return (
        <label className="toggle-container">
            <span className="toggle-label">{label}</span>
            <button
                type="button"
                className={`toggle-switch ${enabled ? 'active' : ''}`}
                onClick={() => onChange(!enabled)}
                role="switch"
                aria-checked={enabled}
            >
                <span className="toggle-thumb" />
            </button>
        </label>
    )
}

/**
 * Result card for displaying chunks
 */
function ResultCard({
    result,
    title
}: {
    result: ExperimentComparisonResult | null
    title: string
}): React.JSX.Element {
    if (!result) {
        return (
            <div className="experiment-result-card empty">
                <h3>{title}</h3>
                <p className="empty-message">Run a query to see results</p>
            </div>
        )
    }

    return (
        <div className="experiment-result-card">
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

export function ExperimentPanel(): React.JSX.Element {
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
    const [useOntology, setUseOntology] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [isProcessingDocs, setIsProcessingDocs] = useState(false)
    const [processingProgress, setProcessingProgress] = useState<ExperimentProgress | null>(null)
    const [error, setError] = useState<string | null>(null)

    const [ragResult, setRagResult] = useState<ExperimentComparisonResult | null>(null)
    const [ontologyResult, setOntologyResult] = useState<ExperimentComparisonResult | null>(null)

    const [fileNames, setFileNames] = useState<string[]>([])
    const [docsProcessed, setDocsProcessed] = useState(false)
    const [chunkCount, setChunkCount] = useState(0)
    const dropZoneRef = useRef<HTMLDivElement>(null)

    // Subscribe to progress events
    useEffect(() => {
        const unsubscribe = window.api.onExperimentProgress((progress) => {
            setProcessingProgress(progress)
        })
        return unsubscribe
    }, [])

    useEffect(() => {
        const loadStoredKey = async () => {
            const response = await window.api.getStoredLLMApiKey('openrouter')
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
                // Get the actual file path using the preload API
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

        // Process documents
        const result = await window.api.processExperimentDocs(paths)

        setIsProcessingDocs(false)
        setProcessingProgress(null)

        if (result.success) {
            setDocsProcessed(true)
            setChunkCount(result.chunkCount ?? 0)
        } else {
            setError(result.error ?? 'Failed to process documents')
        }
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }, [])

    const handleClear = useCallback(async () => {
        await window.api.clearExperiment()
        setFileNames([])
        setDocsProcessed(false)
        setChunkCount(0)
        setRagResult(null)
        setOntologyResult(null)
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
        setRagResult(null)
        setOntologyResult(null)

        const result = await window.api.runExperimentQuery({
            query: query.trim(),
            apiKey: apiKey.trim(),
            model: selectedModel,
            useOntology
        })

        setIsLoading(false)

        if (result.success) {
            if (result.ragResult) {
                setRagResult(result.ragResult)
            }
            if (result.ontologyResult) {
                setOntologyResult(result.ontologyResult)
            }
        } else {
            setError(result.error ?? 'Query failed')
        }
    }, [query, apiKey, selectedModel, useOntology, docsProcessed, hasStoredKey])

    const handleSaveApiKey = useCallback(async () => {
        const key = apiKey.trim()
        if (!key) return
        const response = await window.api.setLLMApiKey(key, 'openrouter')
        if (response.success) {
            setApiKey('')
            setIsRevealed(false)
            setRevealedKey('')
            const stored = await window.api.getStoredLLMApiKey('openrouter')
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
        const response = await window.api.clearLLMApiKey('openrouter')
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
        const response = await window.api.revealStoredLLMApiKey('openrouter')
        if (response.success && response.hasKey) {
            setRevealedKey(response.apiKey ?? '')
            setIsRevealed(true)
        } else {
            setError(response.error ?? 'Failed to reveal API key')
        }
    }, [hasStoredKey, isRevealed])

    return (
        <div className="panel experiment-panel active" id="experiment">
            <div className="page-header">
                <h1 className="page-title">Ontology Experiment</h1>
                <p className="page-subtitle">Compare RAG vs Ontology-enhanced retrieval</p>
            </div>

            {/* Configuration Section */}
            <div className="experiment-config">
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

            {/* File Drop Zone */}
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

            {/* Error Message */}
            {error && (
                <div className="experiment-error">
                    <p>{error}</p>
                </div>
            )}

            {/* Query Section */}
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
                        {isLoading ? 'Running...' : 'Compare'}
                    </button>
                </div>

                <div className="query-options">
                    <Toggle
                        enabled={useOntology}
                        onChange={setUseOntology}
                        label="Show ontology-enhanced results"
                    />
                </div>
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="query-loading">
                    <LoadingSpinner message="Querying LLM..." />
                </div>
            )}

            {/* Comparison Results */}
            <div className="comparison-container">
                <div className="comparison-column">
                    <ResultCard result={ragResult} title="RAG Only" />
                </div>
                {useOntology && (
                    <div className="comparison-column">
                        <ResultCard result={ontologyResult} title="RAG + Ontology" />
                    </div>
                )}
            </div>
        </div>
    )
}

export default ExperimentPanel

import React, { useState, useEffect, useCallback } from 'react'
import type { AppConfig, LLMModel, EmbeddingModelInfo } from '../../../../shared/types'

export function SettingsPanel(): React.JSX.Element {
    const [config, setConfig] = useState<AppConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [saveMessage, setSaveMessage] = useState<string | null>(null)

    // LLM state
    const [llmModels, setLlmModels] = useState<LLMModel[]>([])
    const [selectedLLMModel, setSelectedLLMModel] = useState('')
    const [hasLLMKey, setHasLLMKey] = useState(false)
    const [llmReady, setLlmReady] = useState(false)
    const [testingLLM, setTestingLLM] = useState(false)

    // API key states
    const [openRouterKey, setOpenRouterKey] = useState('')
    const [geminiKey, setGeminiKey] = useState('')
    const [hasGeminiKey, setHasGeminiKey] = useState(false)

    // Embedding models state
    const [embeddingModels, setEmbeddingModels] = useState<EmbeddingModelInfo[]>([])
    const [activeEmbeddingModel, setActiveEmbeddingModel] = useState('')
    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})

    // Load config and LLM info on mount
    useEffect(() => {
        const loadData = async (): Promise<void> => {
            try {
                const [configResponse, modelsResponse, llmConfigResponse, embeddingModelsResponse] = await Promise.all([
                    window.api.getConfig(),
                    window.api.getLLMModels(),
                    window.api.getLLMConfig(),
                    window.api.getEmbeddingModels()
                ])

                if (configResponse.success && configResponse.config) {
                    setConfig(configResponse.config)
                } else {
                    throw new Error(configResponse.error ?? 'Failed to load config')
                }

                if (modelsResponse.success && modelsResponse.models) {
                    setLlmModels(modelsResponse.models)
                }

                if (llmConfigResponse.success && llmConfigResponse.config) {
                    setHasLLMKey(llmConfigResponse.config.hasOpenRouterKey)
                    setHasGeminiKey(llmConfigResponse.config.hasGeminiKey)
                    setLlmReady(llmConfigResponse.config.isReady)
                    setSelectedLLMModel(llmConfigResponse.config.model)
                }

                if (embeddingModelsResponse.success && embeddingModelsResponse.models) {
                    setEmbeddingModels(embeddingModelsResponse.models)
                    setActiveEmbeddingModel(embeddingModelsResponse.activeModelId ?? '')
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load settings')
            } finally {
                setLoading(false)
            }
        }
        void loadData()
    }, [])

    // Subscribe to download progress events
    useEffect(() => {
        const unsubscribe = window.api.onEmbeddingModelDownloadProgress((progress) => {
            setDownloadProgress((prev) => ({
                ...prev,
                [progress.modelId]: progress.percent
            }))

            // Refresh model list when download completes or fails
            if (progress.status === 'complete' || progress.status === 'error') {
                // Clear progress for this model
                setDownloadProgress((prev) => {
                    const next = { ...prev }
                    delete next[progress.modelId]
                    return next
                })

                if (progress.status === 'error') {
                    setError(`Failed to download model ${progress.modelId}`)
                }

                // Refresh the model list to update "downloading" status
                window.api.getEmbeddingModels().then((res) => {
                    if (res.success && res.models) {
                        setEmbeddingModels(res.models)
                        setActiveEmbeddingModel(res.activeModelId ?? '')
                    }
                })
            }
        })
        return unsubscribe
    }, [])

    const showMessage = (msg: string) => {
        setSaveMessage(msg)
        setTimeout(() => setSaveMessage(null), 3000)
    }

    const handleDownloadModel = useCallback(async (modelId: string) => {
        setSaving(true)
        try {
            // Start download - progress will be received via event
            await window.api.downloadEmbeddingModel(modelId)
            showMessage('Model downloaded successfully')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to download model')
        } finally {
            setSaving(false)
        }
    }, [])

    const handleSetActiveEmbeddingModel = useCallback(async (modelId: string) => {
        setSaving(true)
        try {
            const response = await window.api.setActiveEmbeddingModel(modelId)
            if (response.success) {
                setActiveEmbeddingModel(modelId)
                showMessage('Active embedding model updated')
            } else {
                setError(response.error ?? 'Failed to set active model')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to set active model')
        } finally {
            setSaving(false)
        }
    }, [])

    const handleSaveOpenRouterKey = useCallback(async () => {
        if (!openRouterKey.trim()) return

        setSaving(true)
        try {
            const response = await window.api.setLLMApiKey(openRouterKey, 'openrouter')
            if (response.success) {
                setHasLLMKey(true)
                setLlmReady(true)
                setOpenRouterKey('')
                showMessage('OpenRouter API key saved successfully')
            } else {
                setError(response.error ?? 'Failed to save API key')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save API key')
        } finally {
            setSaving(false)
        }
    }, [openRouterKey])

    const handleClearOpenRouterKey = useCallback(async () => {
        setSaving(true)
        try {
            const response = await window.api.clearLLMApiKey('openrouter')
            if (response.success) {
                setHasLLMKey(false)
                setLlmReady(false)
                showMessage('API key cleared')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clear API key')
        } finally {
            setSaving(false)
        }
    }, [])

    const handleSaveLLMModel = useCallback(async () => {
        setSaving(true)
        try {
            const response = await window.api.setLLMModel(selectedLLMModel)
            if (response.success) {
                showMessage('LLM model updated')
            } else {
                setError(response.error ?? 'Failed to set model')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to set model')
        } finally {
            setSaving(false)
        }
    }, [selectedLLMModel])

    const handleTestLLM = useCallback(async () => {
        if (!llmReady) return

        setTestingLLM(true)
        setError(null)

        try {
            const response = await window.api.testLLM()
            if (response.success) {
                showMessage(`LLM test successful: "${response.response}"`)
            } else {
                setError(response.error ?? 'LLM test failed')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'LLM test failed')
        } finally {
            setTestingLLM(false)
        }
    }, [llmReady])

    const handleSaveGeminiKey = useCallback(async () => {
        if (!geminiKey.trim()) return

        setSaving(true)
        try {
            const response = await window.api.setLLMApiKey(geminiKey, 'gemini')
            if (response.success) {
                setHasGeminiKey(true)
                setGeminiKey('')
                showMessage('Gemini API key saved successfully')
            } else {
                setError(response.error ?? 'Failed to save Gemini key')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save Gemini key')
        } finally {
            setSaving(false)
        }
    }, [geminiKey])

    const handleClearGeminiKey = useCallback(async () => {
        setSaving(true)
        try {
            const response = await window.api.clearLLMApiKey('gemini')
            if (response.success) {
                setHasGeminiKey(false)
                showMessage('Gemini API key cleared')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clear Gemini key')
        } finally {
            setSaving(false)
        }
    }, [])

    if (loading) {
        return (
            <div className="panel active" id="settings">
                <div className="page-header">
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Loading configuration...</p>
                </div>
                <div style={{ textAlign: 'center', padding: '48px' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto' }} />
                </div>
            </div>
        )
    }

    return (
        <div className="panel active" id="settings">
            <div className="page-header">
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Configure your instance</p>
            </div>

            {error && (
                <div className="search-error" style={{ marginBottom: '16px' }}>
                    {error}
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        style={{ marginLeft: '12px', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7 }}
                    >
                        ×
                    </button>
                </div>
            )}
            {saveMessage && (
                <div
                    style={{
                        padding: '12px 16px',
                        background: 'var(--success-light)',
                        color: 'var(--success)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '13px',
                        marginBottom: '16px'
                    }}
                >
                    {saveMessage}
                </div>
            )}

            {/* LLM Configuration Section */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <div className="settings-section-title">LLM (Language Model)</div>
                    <span
                        style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 500,
                            background: llmReady ? 'var(--success-light)' : 'var(--bg-tertiary)',
                            color: llmReady ? 'var(--success)' : 'var(--text-tertiary)'
                        }}
                    >
                        {llmReady ? 'Ready' : 'Not Configured'}
                    </span>
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">OpenRouter API Key</div>
                        <div className="settings-help">Required for autonomous agent features</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {hasLLMKey ? (
                            <>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>sk-or-••••••••</span>
                                <button className="btn-ghost" onClick={handleClearOpenRouterKey} disabled={saving} type="button">
                                    Clear
                                </button>
                            </>
                        ) : (
                            <>
                                <input
                                    type="password"
                                    className="settings-input"
                                    placeholder="sk-or-..."
                                    value={openRouterKey}
                                    onChange={(e) => setOpenRouterKey(e.target.value)}
                                />
                                <button
                                    className="settings-btn"
                                    onClick={handleSaveOpenRouterKey}
                                    disabled={!openRouterKey.trim() || saving}
                                    type="button"
                                >
                                    Save
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">Model</div>
                        <div className="settings-help">LLM model for planning and analysis</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                            className="settings-select"
                            value={selectedLLMModel}
                            onChange={(e) => setSelectedLLMModel(e.target.value)}
                            disabled={!hasLLMKey}
                        >
                            {llmModels.map((model) => (
                                <option key={model.id} value={model.id}>
                                    {model.name} ({model.provider})
                                </option>
                            ))}
                        </select>
                        <button
                            className="settings-btn"
                            onClick={handleSaveLLMModel}
                            disabled={!hasLLMKey || saving}
                            type="button"
                        >
                            Set
                        </button>
                    </div>
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">Test Connection</div>
                        <div className="settings-help">Verify LLM is working</div>
                    </div>
                    <button
                        className="settings-btn"
                        onClick={handleTestLLM}
                        disabled={!llmReady || testingLLM}
                        type="button"
                    >
                        {testingLLM ? 'Testing...' : 'Test LLM'}
                    </button>
                </div>
            </div>

            {/* Embedding Model Section */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <div className="settings-section-title">Embedding Models</div>
                    <span
                        style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 500,
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-tertiary)'
                        }}
                    >
                        Local Processing
                    </span>
                </div>
                <div className="settings-help" style={{ marginBottom: '12px' }}>
                    Embedding models convert your documents into vectors for semantic search. Download a model to enable it.
                </div>

                {/* Model list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {embeddingModels.map((model) => (
                        <div
                            key={model.id}
                            onClick={() => {
                                if (model.downloaded && !model.downloading && activeEmbeddingModel !== model.id) {
                                    handleSetActiveEmbeddingModel(model.id)
                                }
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 16px',
                                background: activeEmbeddingModel === model.id ? 'var(--accent-light)' : 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-md)',
                                border: activeEmbeddingModel === model.id ? '1px solid var(--accent)' : '1px solid transparent',
                                cursor: model.downloaded && !model.downloading ? 'pointer' : 'default',
                                opacity: model.downloading ? 0.7 : 1,
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                <input
                                    type="radio"
                                    name="embeddingModel"
                                    checked={activeEmbeddingModel === model.id}
                                    readOnly // Managed by parent onClick
                                    disabled={!model.downloaded || model.downloading}
                                    style={{ margin: 0, cursor: 'inherit' }}
                                />
                                <div>
                                    <div style={{ fontWeight: 500, fontSize: '14px' }}>
                                        {model.name}
                                        {activeEmbeddingModel === model.id && (
                                            <span
                                                style={{
                                                    marginLeft: '8px',
                                                    padding: '2px 6px',
                                                    background: 'var(--accent)',
                                                    color: 'white',
                                                    borderRadius: '4px',
                                                    fontSize: '10px'
                                                }}
                                            >
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                        {model.description} • {(model.sizeBytes / 1_000_000).toFixed(0)} MB • {model.dimensions}d
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {model.downloading || downloadProgress[model.id] !== undefined ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div className="loading-spinner" style={{ width: '16px', height: '16px' }} />
                                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            {downloadProgress[model.id] !== undefined && downloadProgress[model.id] > 0
                                                ? `${downloadProgress[model.id]}%`
                                                : 'Downloading...'}
                                        </span>
                                    </div>
                                ) : model.downloaded ? (
                                    <span style={{ color: 'var(--success)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontSize: '14px' }}>✓</span> Downloaded
                                    </span>
                                ) : (
                                    <button
                                        className="settings-btn"
                                        onClick={() => handleDownloadModel(model.id)}
                                        disabled={saving}
                                        type="button"
                                        style={{ minWidth: '80px' }}
                                    >
                                        Download
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* API Keys Section */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <div className="settings-section-title">Other API Keys</div>
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">Gemini API Key</div>
                        <div className="settings-help">Optional - for future Gemini AI features</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {hasGeminiKey ? (
                            <>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>AI••••••••</span>
                                <button className="btn-ghost" onClick={handleClearGeminiKey} disabled={saving} type="button">
                                    Clear
                                </button>
                            </>
                        ) : (
                            <>
                                <input
                                    type="password"
                                    className="settings-input"
                                    placeholder="AI..."
                                    value={geminiKey}
                                    onChange={(e) => setGeminiKey(e.target.value)}
                                />
                                <button
                                    className="settings-btn"
                                    onClick={handleSaveGeminiKey}
                                    disabled={!geminiKey.trim() || saving}
                                    type="button"
                                >
                                    Save
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Storage Section */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <div className="settings-section-title">Storage</div>
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">Brain Directory</div>
                        <div className="settings-help">Where files are stored</div>
                    </div>
                    <input
                        type="text"
                        className="settings-input"
                        value={config?.brainDirectory ?? '~/Work/brain'}
                        readOnly
                    />
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">Max File Size</div>
                        <div className="settings-help">Maximum file size for ingestion</div>
                    </div>
                    <input
                        type="text"
                        className="settings-input"
                        value={`${((config?.ingestion.maxFileSize ?? 10485760) / 1048576).toFixed(0)} MB`}
                        readOnly
                    />
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">Chunk Size</div>
                        <div className="settings-help">Characters per chunk for embedding</div>
                    </div>
                    <input
                        type="text"
                        className="settings-input"
                        value={config?.ingestion.chunkSize ?? 1000}
                        readOnly
                    />
                </div>
            </div>

            {/* Debug Info */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <div className="settings-section-title">Debug</div>
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">Log Level</div>
                        <div className="settings-help">Logging verbosity</div>
                    </div>
                    <input type="text" className="settings-input" value={config?.logging.level ?? 'info'} readOnly />
                </div>
            </div>
        </div>
    )
}

export default SettingsPanel

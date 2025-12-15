import React, { useState, useEffect, useCallback } from 'react'
import type { AppConfig, LLMModel } from '../../../../shared/types'

// Available embedding models
const EMBEDDING_MODELS = [
    { id: 'all-MiniLM-L6-v2', name: 'all-MiniLM-L6-v2 (Local)', provider: 'local' },
    { id: 'nomic-embed-text', name: 'nomic-embed-text (Local)', provider: 'local' },
    { id: 'text-embedding-3-small', name: 'OpenAI text-embedding-3-small', provider: 'openai' }
]

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
    const [openAiKey, setOpenAiKey] = useState('')
    const [hasOpenAiKey, setHasOpenAiKey] = useState(false)

    // Local state for editing
    const [selectedModel, setSelectedModel] = useState('')

    // Load config and LLM info on mount
    useEffect(() => {
        const loadData = async (): Promise<void> => {
            try {
                const [configResponse, modelsResponse, llmConfigResponse] = await Promise.all([
                    window.api.getConfig(),
                    window.api.getLLMModels(),
                    window.api.getLLMConfig()
                ])

                if (configResponse.success && configResponse.config) {
                    setConfig(configResponse.config)
                    setSelectedModel(configResponse.config.embedding.model)
                } else {
                    throw new Error(configResponse.error ?? 'Failed to load config')
                }

                if (modelsResponse.success && modelsResponse.models) {
                    setLlmModels(modelsResponse.models)
                }

                if (llmConfigResponse.success && llmConfigResponse.config) {
                    setHasLLMKey(llmConfigResponse.config.hasApiKey)
                    setLlmReady(llmConfigResponse.config.isReady)
                    setSelectedLLMModel(llmConfigResponse.config.model)
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load settings')
            } finally {
                setLoading(false)
            }
        }
        void loadData()
    }, [])

    const handleSaveModel = useCallback(async () => {
        if (!config || selectedModel === config.embedding.model) return

        setSaving(true)
        setSaveMessage(null)

        try {
            const response = await window.api.setConfig({
                embedding: { model: selectedModel }
            })

            if (response.success && response.config) {
                setConfig(response.config)
                showMessage('Embedding model updated successfully')
            } else {
                throw new Error(response.error ?? 'Failed to save')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save settings')
        } finally {
            setSaving(false)
        }
    }, [config, selectedModel])

    const showMessage = (msg: string) => {
        setSaveMessage(msg)
        setTimeout(() => setSaveMessage(null), 3000)
    }

    const handleSaveOpenRouterKey = useCallback(async () => {
        if (!openRouterKey.trim()) return

        setSaving(true)
        try {
            const response = await window.api.setLLMApiKey(openRouterKey)
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
            const response = await window.api.clearLLMApiKey()
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

    const handleSaveOpenAiKey = useCallback(async () => {
        if (!openAiKey.trim()) return
        // Placeholder - OpenAI key storage not yet implemented
        console.log('Would save OpenAI key:', openAiKey.substring(0, 8) + '...')
        setHasOpenAiKey(true)
        setOpenAiKey('')
        showMessage('OpenAI API key saved')
    }, [openAiKey])

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
                    <div className="settings-section-title">Embedding Model</div>
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">Active Model</div>
                        <div className="settings-help">Used for processing new files</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                            className="settings-select"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                        >
                            {EMBEDDING_MODELS.map((model) => (
                                <option key={model.id} value={model.id}>
                                    {model.name}
                                </option>
                            ))}
                        </select>
                        {selectedModel !== config?.embedding.model && (
                            <button className="settings-btn" onClick={handleSaveModel} disabled={saving} type="button">
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* API Keys Section */}
            <div className="settings-section">
                <div className="settings-section-header">
                    <div className="settings-section-title">Other API Keys</div>
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">OpenAI API Key</div>
                        <div className="settings-help">Optional - for direct OpenAI embeddings</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="password"
                            className="settings-input"
                            placeholder={hasOpenAiKey ? 'sk-••••••••' : 'sk-...'}
                            value={openAiKey}
                            onChange={(e) => setOpenAiKey(e.target.value)}
                        />
                        <button
                            className="settings-btn"
                            onClick={handleSaveOpenAiKey}
                            disabled={!openAiKey.trim()}
                            type="button"
                        >
                            Save
                        </button>
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

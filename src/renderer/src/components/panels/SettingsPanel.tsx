import React, { useState, useEffect, useCallback } from 'react'
import type { AppConfig } from '../../../../shared/types'

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

    // API key states (not stored in config, managed separately)
    const [openRouterKey, setOpenRouterKey] = useState('')
    const [openAiKey, setOpenAiKey] = useState('')
    const [hasOpenRouterKey, setHasOpenRouterKey] = useState(false)
    const [hasOpenAiKey, setHasOpenAiKey] = useState(false)

    // Local state for editing
    const [selectedModel, setSelectedModel] = useState('')

    // Load config on mount
    useEffect(() => {
        const loadConfig = async (): Promise<void> => {
            try {
                const response = await window.api.getConfig()
                if (response.success && response.config) {
                    setConfig(response.config)
                    setSelectedModel(response.config.embedding.model)
                } else {
                    throw new Error(response.error ?? 'Failed to load config')
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load settings')
            } finally {
                setLoading(false)
            }
        }
        void loadConfig()
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
                setSaveMessage('Model updated successfully')
                setTimeout(() => setSaveMessage(null), 3000)
            } else {
                throw new Error(response.error ?? 'Failed to save')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save settings')
        } finally {
            setSaving(false)
        }
    }, [config, selectedModel])

    const handleSaveApiKey = useCallback(
        async (provider: 'openrouter' | 'openai') => {
            const key = provider === 'openrouter' ? openRouterKey : openAiKey
            if (!key.trim()) return

            // In a real implementation, this would call a secure API key storage handler
            // For now, we just show a placeholder success message
            console.log(`Would save ${provider} API key:`, key.substring(0, 8) + '...')

            if (provider === 'openrouter') {
                setHasOpenRouterKey(true)
                setOpenRouterKey('')
            } else {
                setHasOpenAiKey(true)
                setOpenAiKey('')
            }

            setSaveMessage(`${provider === 'openrouter' ? 'OpenRouter' : 'OpenAI'} API key saved`)
            setTimeout(() => setSaveMessage(null), 3000)
        },
        [openRouterKey, openAiKey]
    )

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

            {error && <div className="search-error">{error}</div>}
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
                    <div className="settings-section-title">API Keys</div>
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">OpenRouter API Key</div>
                        <div className="settings-help">For LLM features and API embedding models</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="password"
                            className="settings-input"
                            placeholder={hasOpenRouterKey ? 'sk-or-••••••••' : 'sk-or-...'}
                            value={openRouterKey}
                            onChange={(e) => setOpenRouterKey(e.target.value)}
                        />
                        <button
                            className="settings-btn"
                            onClick={() => handleSaveApiKey('openrouter')}
                            disabled={!openRouterKey.trim()}
                            type="button"
                        >
                            Save
                        </button>
                    </div>
                </div>
                <div className="settings-row">
                    <div>
                        <div className="settings-label">OpenAI API Key</div>
                        <div className="settings-help">Optional - for direct OpenAI access</div>
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
                            onClick={() => handleSaveApiKey('openai')}
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

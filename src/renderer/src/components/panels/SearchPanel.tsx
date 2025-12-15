import React, { useState, useCallback, useEffect, useRef } from 'react'
import { SearchIcon } from '../Icons'
import type { SearchResult } from '../../../../shared/types'

/**
 * Custom debounce hook
 */
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)

        return () => {
            clearTimeout(handler)
        }
    }, [value, delay])

    return debouncedValue
}

/**
 * Highlight matching text in a string
 */
function highlightText(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text

    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return text

    // Create regex pattern for all words
    const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const regex = new RegExp(`(${pattern})`, 'gi')

    const parts = text.split(regex)

    return (
        <>
            {parts.map((part, i) =>
                words.some(w => part.toLowerCase() === w) ? (
                    <mark key={i} className="search-highlight">
                        {part}
                    </mark>
                ) : (
                    part
                )
            )}
        </>
    )
}

/**
 * Relevance score bar component
 */
function RelevanceBar({ score }: { score: number }): React.JSX.Element {
    // Score is distance, lower is better. Convert to percentage
    const percentage = Math.max(0, Math.min(100, (1 - score) * 100))
    const color =
        percentage >= 70 ? 'var(--success)' : percentage >= 40 ? 'var(--warning)' : 'var(--text-tertiary)'

    return (
        <div className="relevance-bar" style={{ width: '60px', height: '4px', background: 'var(--bg-muted)', borderRadius: '2px' }}>
            <div
                style={{
                    width: `${percentage}%`,
                    height: '100%',
                    background: color,
                    borderRadius: '2px',
                    transition: 'width 0.3s ease'
                }}
            />
        </div>
    )
}

export function SearchPanel(): React.JSX.Element {
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<SearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [searchError, setSearchError] = useState<string | null>(null)
    const [hasSearched, setHasSearched] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    // Debounced search query (300ms)
    const debouncedQuery = useDebounce(searchQuery, 300)

    // Auto-search when debounced query changes
    useEffect(() => {
        if (debouncedQuery.trim().length >= 2) {
            void performSearch(debouncedQuery)
        } else if (debouncedQuery.trim().length === 0 && hasSearched) {
            setSearchResults([])
            setHasSearched(false)
        }
    }, [debouncedQuery]) // eslint-disable-line react-hooks/exhaustive-deps

    // Keyboard shortcut: Cmd+K to focus search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                inputRef.current?.focus()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    const performSearch = useCallback(async (query: string) => {
        if (!query.trim()) return

        setIsSearching(true)
        setSearchError(null)
        setHasSearched(true)

        try {
            const response = await window.api.searchBrain(query)

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
    }, [])

    const handleKeyPress = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                void performSearch(searchQuery)
            }
        },
        [performSearch, searchQuery]
    )

    const clearSearch = useCallback(() => {
        setSearchQuery('')
        setSearchResults([])
        setHasSearched(false)
        inputRef.current?.focus()
    }, [])

    return (
        <div className="panel active" id="search">
            <div className="page-header">
                <h1 className="page-title">Search</h1>
                <p className="page-subtitle">
                    Query your knowledge base
                    <span className="keyboard-hint" style={{ marginLeft: '8px', fontSize: '11px', opacity: 0.6 }}>
                        ⌘K
                    </span>
                </p>
            </div>

            <div className="search-container">
                <div className="search-input-wrapper">
                    <SearchIcon />
                    <input
                        ref={inputRef}
                        type="text"
                        className="search-input-large"
                        placeholder="Ask anything..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={isSearching}
                    />
                    {searchQuery && (
                        <button
                            className="search-clear"
                            onClick={clearSearch}
                            type="button"
                            aria-label="Clear search"
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                opacity: 0.5,
                                fontSize: '18px'
                            }}
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            {searchError && <div className="search-error">{searchError}</div>}

            {isSearching ? (
                <div className="search-empty">
                    <div className="loading-spinner" style={{ margin: '0 auto' }} />
                    <p className="loading-text" style={{ marginTop: '16px' }}>
                        Searching...
                    </p>
                </div>
            ) : searchResults.length > 0 ? (
                <>
                    <div className="search-meta" style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    </div>
                    <div className="results-list">
                        {searchResults.map((result, index) => (
                            <div key={`${result.fileId}-${result.chunkIndex}-${index}`} className="result-card">
                                <div className="result-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <div className="result-source">
                                        {result.fileName}
                                    </div>
                                    <div className="result-relevance" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <RelevanceBar score={result.score} />
                                        <span className="result-score-badge">
                                            {((1 - result.score) * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                                <div className="result-text">
                                    {highlightText(result.text, searchQuery)}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : hasSearched ? (
                <div className="search-empty">
                    <div className="search-empty-icon">
                        <SearchIcon />
                    </div>
                    <p>No results found for &quot;{searchQuery}&quot;</p>
                    <p style={{ fontSize: '12px', marginTop: '8px', color: 'var(--text-tertiary)' }}>
                        Try different keywords or check if files are indexed in the Files panel
                    </p>
                    <div style={{ marginTop: '16px' }}>
                        <button
                            className="btn-ghost"
                            onClick={clearSearch}
                            type="button"
                        >
                            Clear search
                        </button>
                    </div>
                </div>
            ) : (
                <div className="search-empty">
                    <div className="search-empty-icon">
                        <SearchIcon />
                    </div>
                    <p>Enter a query to search your knowledge base</p>
                    <p style={{ fontSize: '12px', marginTop: '8px', color: 'var(--text-tertiary)' }}>
                        Semantic search finds content by meaning, not just keywords
                    </p>
                </div>
            )}
        </div>
    )
}

export default SearchPanel

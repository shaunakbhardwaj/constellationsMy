import React, { useState, useCallback } from 'react'
import { SearchIcon } from '../Icons'
import type { SearchResult } from '../../../../shared/types'

export function SearchPanel(): React.JSX.Element {
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<SearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [searchError, setSearchError] = useState<string | null>(null)
    const [hasSearched, setHasSearched] = useState(false)

    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim()) return

        setIsSearching(true)
        setSearchError(null)
        setHasSearched(true)

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

    const handleKeyPress = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                void handleSearch()
            }
        },
        [handleSearch]
    )

    return (
        <div className="panel active" id="search">
            <div className="page-header">
                <h1 className="page-title">Search</h1>
                <p className="page-subtitle">Query your knowledge base</p>
            </div>

            <div className="search-container">
                <div className="search-input-wrapper">
                    <SearchIcon />
                    <input
                        type="text"
                        className="search-input-large"
                        placeholder="Ask anything..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={isSearching}
                    />
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
                <div className="results-list">
                    {searchResults.map((result, index) => (
                        <div key={`${result.fileId}-${result.chunkIndex}-${index}`} className="result-card">
                            <div className="result-source">
                                {result.fileName}
                                <span className="result-score-badge">
                                    {((1 - result.score) * 100).toFixed(0)}% match
                                </span>
                            </div>
                            <div className="result-text">{result.text}</div>
                        </div>
                    ))}
                </div>
            ) : hasSearched ? (
                <div className="search-empty">
                    <div className="search-empty-icon">
                        <SearchIcon />
                    </div>
                    <p>No results found for &quot;{searchQuery}&quot;</p>
                    <p style={{ fontSize: '12px', marginTop: '8px' }}>
                        Try different keywords or add more files to your knowledge base
                    </p>
                </div>
            ) : (
                <div className="search-empty">
                    <div className="search-empty-icon">
                        <SearchIcon />
                    </div>
                    <p>Enter a query to search your knowledge base</p>
                </div>
            )}
        </div>
    )
}

export default SearchPanel

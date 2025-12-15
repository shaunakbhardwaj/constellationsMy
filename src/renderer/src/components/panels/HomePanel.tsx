import React, { useState, useCallback, useEffect } from 'react'
import { getFileIcon } from '../Icons'
import type { BrainFileRow, Goal } from '../../../../shared/types'
import type { Panel } from '../Sidebar'

interface HomePanelProps {
    onNavigateToSearch: () => void
    onNavigateToPanel: (panel: Panel) => void
}

// Helper to get greeting based on time of day
function getGreeting(): string {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
}

// Helper to format relative time
function formatRelativeTime(timestamp: number): string {
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 60) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(timestamp).toLocaleDateString()
}

export function HomePanel({ onNavigateToSearch, onNavigateToPanel }: HomePanelProps): React.JSX.Element {
    const [searchQuery, setSearchQuery] = useState('')
    const [goals, setGoals] = useState<Goal[]>([])
    const [goalsLoading, setGoalsLoading] = useState(true)
    const [newGoalText, setNewGoalText] = useState('')
    const [recentFiles, setRecentFiles] = useState<BrainFileRow[]>([])
    const [recentFilesLoading, setRecentFilesLoading] = useState(true)

    // Load goals and recent files on mount
    useEffect(() => {
        const loadData = async (): Promise<void> => {
            // Load goals
            try {
                const goalsResponse = await window.api.getGoals()
                if (goalsResponse.success && goalsResponse.goals) {
                    setGoals(goalsResponse.goals)
                }
            } catch (error) {
                console.error('Failed to load goals:', error)
            } finally {
                setGoalsLoading(false)
            }

            // Load recent files
            try {
                const filesResponse = await window.api.fetchBrainData()
                if (filesResponse.success && filesResponse.files) {
                    const sorted = [...filesResponse.files]
                        .sort((a, b) => (b.lastIndexedAt ?? 0) - (a.lastIndexedAt ?? 0))
                        .slice(0, 5)
                    setRecentFiles(sorted)
                }
            } catch (error) {
                console.error('Failed to load recent files:', error)
            } finally {
                setRecentFilesLoading(false)
            }
        }
        void loadData()
    }, [])

    const handleSearchSubmit = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && searchQuery.trim()) {
                onNavigateToSearch()
            }
        },
        [searchQuery, onNavigateToSearch]
    )

    const handleToggleGoal = useCallback(async (goalId: string) => {
        try {
            const response = await window.api.toggleGoalComplete(goalId)
            if (response.success && response.goal) {
                setGoals((prev) =>
                    prev.map((goal) => (goal.id === goalId ? response.goal! : goal))
                )
            }
        } catch (error) {
            console.error('Failed to toggle goal:', error)
        }
    }, [])

    const handleAddGoal = useCallback(async () => {
        if (!newGoalText.trim()) return
        try {
            const response = await window.api.createGoal({ text: newGoalText.trim() })
            if (response.success && response.goal) {
                setGoals((prev) => [response.goal!, ...prev])
                setNewGoalText('')
            }
        } catch (error) {
            console.error('Failed to create goal:', error)
        }
    }, [newGoalText])

    const handleGoalKeyPress = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                void handleAddGoal()
            }
        },
        [handleAddGoal]
    )

    // Helper to get goal meta text
    const getGoalMeta = (goal: Goal): string => {
        if (goal.status === 'completed' && goal.completedAt) {
            return `Completed ${formatRelativeTime(goal.completedAt)}`
        }
        if (goal.autonomousEnabled) {
            return 'Autonomous processing'
        }
        return `Added ${formatRelativeTime(goal.createdAt)}`
    }

    return (
        <div className="panel active" id="home">
            <div className="home-greeting">
                <h1 className="greeting-text">{getGreeting()}</h1>
                <p className="greeting-sub">Here&apos;s what&apos;s happening with your knowledge base</p>
            </div>

            <div className="home-search">
                <input
                    type="text"
                    className="home-search-input"
                    placeholder="Search your knowledge base..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={handleSearchSubmit}
                />
            </div>

            <div className="home-section">
                <div className="section-label">Your Goals</div>
                <div className="goals-list">
                    {goalsLoading ? (
                        <div className="goal-item">
                            <div className="goal-content">
                                <div className="goal-text" style={{ color: 'var(--text-tertiary)' }}>
                                    Loading goals...
                                </div>
                            </div>
                        </div>
                    ) : goals.length === 0 ? (
                        <div className="goal-item">
                            <div className="goal-content">
                                <div className="goal-text" style={{ color: 'var(--text-tertiary)' }}>
                                    No goals yet. Add one below!
                                </div>
                            </div>
                        </div>
                    ) : (
                        goals.map((goal) => (
                            <div key={goal.id} className="goal-item">
                                <div
                                    className={`goal-checkbox ${goal.status === 'completed' ? 'checked' : ''}`}
                                    onClick={() => void handleToggleGoal(goal.id)}
                                    role="checkbox"
                                    aria-checked={goal.status === 'completed'}
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && void handleToggleGoal(goal.id)}
                                />
                                <div className="goal-content">
                                    <div className={`goal-text ${goal.status === 'completed' ? 'completed' : ''}`}>
                                        {goal.text}
                                    </div>
                                    <div className="goal-meta">{getGoalMeta(goal)}</div>
                                </div>
                            </div>
                        ))
                    )}
                    <div className="goal-input-row">
                        <input
                            type="text"
                            className="goal-input"
                            placeholder="Add a new goal..."
                            value={newGoalText}
                            onChange={(e) => setNewGoalText(e.target.value)}
                            onKeyPress={handleGoalKeyPress}
                        />
                        <button className="goal-add-btn" onClick={() => void handleAddGoal()} type="button">
                            Add
                        </button>
                    </div>
                </div>
            </div>

            <div className="home-section">
                <div className="section-label">Recent Files</div>
                <div className="recent-files">
                    {recentFilesLoading ? (
                        <div className="data-empty">Loading recent files...</div>
                    ) : recentFiles.length === 0 ? (
                        <div className="data-empty">
                            No files yet.{' '}
                            <span
                                style={{ textDecoration: 'underline', cursor: 'pointer' }}
                                onClick={() => onNavigateToPanel('files')}
                            >
                                Add some files
                            </span>{' '}
                            to get started.
                        </div>
                    ) : (
                        recentFiles.map((file) => (
                            <div key={file.id} className="recent-file-item">
                                <div className="recent-file-icon">{getFileIcon(file.relativePath)}</div>
                                <div className="recent-file-info">
                                    <div className="recent-file-name">{file.relativePath.split('/').pop()}</div>
                                    <div className="recent-file-path">
                                        {file.relativePath.split('/').slice(0, -1).join('/') || '~'}
                                    </div>
                                </div>
                                <div className="recent-file-status">
                                    <span className={`status-badge ${file.indexedStatus ?? 'pending'}`}>
                                        {file.indexedStatus === 'indexed'
                                            ? 'Indexed'
                                            : file.indexedStatus === 'processing'
                                                ? 'Processing'
                                                : 'Pending'}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

export default HomePanel

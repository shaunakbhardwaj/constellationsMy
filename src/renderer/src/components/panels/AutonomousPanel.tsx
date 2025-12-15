import React, { useState, useEffect, useCallback } from 'react'
import { CheckIcon, ClockIcon } from '../Icons'
import type { AgentState, Goal } from '../../../../shared/types'

export function AutonomousPanel(): React.JSX.Element {
    const [agentState, setAgentState] = useState<AgentState | null>(null)
    const [goals, setGoals] = useState<Goal[]>([])
    const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
    const [guidanceText, setGuidanceText] = useState('')
    const [loading, setLoading] = useState(true)

    // Load initial state and goals
    useEffect(() => {
        const loadData = async (): Promise<void> => {
            try {
                const [stateResponse, goalsResponse] = await Promise.all([
                    window.api.getAgentState(),
                    window.api.getGoals()
                ])

                if (stateResponse.success && stateResponse.state) {
                    setAgentState(stateResponse.state)
                }

                if (goalsResponse.success && goalsResponse.goals) {
                    // Only show pending/in_progress goals (not completed)
                    setGoals(goalsResponse.goals.filter(g => g.status !== 'completed'))
                }
            } catch (error) {
                console.error('Failed to load autonomous data:', error)
            } finally {
                setLoading(false)
            }
        }
        void loadData()

        // Subscribe to state changes (with null check for safety)
        let unsubscribe: (() => void) | undefined
        if (typeof window.api?.onAgentStateChange === 'function') {
            unsubscribe = window.api.onAgentStateChange((state) => {
                setAgentState(state)
            })
        }

        return () => {
            if (unsubscribe) unsubscribe()
        }
    }, [])

    const isIdle = !agentState || agentState.status === 'idle' || agentState.status === 'completed'
    const isRunning = agentState?.status === 'executing' || agentState?.status === 'planning'
    const isPaused = agentState?.status === 'paused'
    const hasError = agentState?.status === 'error'

    const handleStartGoal = useCallback(async () => {
        if (!selectedGoalId) return
        try {
            const response = await window.api.startAgent(selectedGoalId)
            if (!response.success) {
                console.error('Failed to start agent:', response.error)
            }
        } catch (error) {
            console.error('Failed to start agent:', error)
        }
    }, [selectedGoalId])

    const handlePause = useCallback(async () => {
        try {
            await window.api.pauseAgent()
        } catch (error) {
            console.error('Failed to pause agent:', error)
        }
    }, [])

    const handleResume = useCallback(async () => {
        try {
            await window.api.resumeAgent()
        } catch (error) {
            console.error('Failed to resume agent:', error)
        }
    }, [])

    const handleStop = useCallback(async () => {
        try {
            await window.api.stopAgent()
        } catch (error) {
            console.error('Failed to stop agent:', error)
        }
    }, [])

    const handleSendGuidance = useCallback(async () => {
        if (!guidanceText.trim()) return
        try {
            await window.api.sendAgentGuidance(guidanceText)
            setGuidanceText('')
        } catch (error) {
            console.error('Failed to send guidance:', error)
        }
    }, [guidanceText])

    const getStatusText = (): string => {
        if (!agentState) return 'Loading...'
        switch (agentState.status) {
            case 'idle':
                return 'Idle'
            case 'planning':
                return 'Planning...'
            case 'executing':
                return agentState.currentTask ?? 'Executing...'
            case 'paused':
                return 'Paused'
            case 'completed':
                return 'Completed'
            case 'error':
                return `Error: ${agentState.error ?? 'Unknown error'}`
            default:
                return 'Unknown'
        }
    }

    const getStatusSubtext = (): string => {
        if (!agentState) return ''
        if (agentState.status === 'idle') return 'Select a goal to start processing'
        if (agentState.currentGoalText) return agentState.currentGoalText
        return ''
    }

    if (loading) {
        return (
            <div className="panel active" id="autonomous">
                <div className="page-header">
                    <h1 className="page-title">Autonomous</h1>
                    <p className="page-subtitle">Loading...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="panel active" id="autonomous">
            <div className="page-header">
                <h1 className="page-title">Autonomous</h1>
                <p className="page-subtitle">
                    {isIdle ? 'Ready to work on your goals' : 'The agent is working on your goals'}
                </p>
            </div>

            {/* Goal Selection (when idle) */}
            {isIdle && goals.length > 0 && (
                <div className="goal-selector" style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                        Select a goal to process:
                    </label>
                    <select
                        value={selectedGoalId ?? ''}
                        onChange={(e) => setSelectedGoalId(e.target.value || null)}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-light)',
                            fontSize: '14px',
                            marginBottom: '12px'
                        }}
                    >
                        <option value="">Choose a goal...</option>
                        {goals.map((goal) => (
                            <option key={goal.id} value={goal.id}>
                                {goal.text.length > 60 ? goal.text.substring(0, 60) + '...' : goal.text}
                            </option>
                        ))}
                    </select>
                    <button
                        className="btn-primary"
                        onClick={() => void handleStartGoal()}
                        disabled={!selectedGoalId}
                        type="button"
                        style={{ width: '100%' }}
                    >
                        Start Processing
                    </button>
                </div>
            )}

            {isIdle && goals.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    <p>No pending goals. Add goals from the Home panel to get started.</p>
                </div>
            )}

            {/* Status Indicator */}
            <div className="autonomous-status">
                <div className={`status-spinner ${isIdle ? 'idle' : hasError ? 'error' : ''}`} />
                <div className="status-info">
                    <h3>{getStatusText()}</h3>
                    <p>{getStatusSubtext()}</p>
                </div>
                {(isRunning || isPaused) && (
                    <div className="status-controls" style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                        {isRunning && (
                            <button className="btn-ghost" onClick={() => void handlePause()} type="button">
                                Pause
                            </button>
                        )}
                        {isPaused && (
                            <button className="btn-ghost" onClick={() => void handleResume()} type="button">
                                Resume
                            </button>
                        )}
                        <button className="btn-ghost" onClick={() => void handleStop()} type="button" style={{ color: 'var(--error)' }}>
                            Stop
                        </button>
                    </div>
                )}
            </div>

            {/* Progress and Up Next Cards */}
            <div className="autonomous-grid">
                <div className="auto-card">
                    <div className="auto-card-header">
                        <CheckIcon />
                        <span className="auto-card-title">Progress</span>
                    </div>
                    <div className="auto-card-content">
                        {!agentState || agentState.progress.length === 0 ? (
                            <p className="auto-card-empty">No progress yet. Start a task to see updates here.</p>
                        ) : (
                            <ul>
                                {agentState.progress.map((item) => (
                                    <li key={item.id}>{item.description}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="auto-card next">
                    <div className="auto-card-header">
                        <ClockIcon />
                        <span className="auto-card-title">Up Next</span>
                    </div>
                    <div className="auto-card-content">
                        {!agentState || agentState.upNext.length === 0 ? (
                            <p className="auto-card-empty">No planned tasks.</p>
                        ) : (
                            <ul>
                                {agentState.upNext.map((item) => (
                                    <li key={item.id}>{item.description}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* Guidance Input */}
            <div className="guidance-section">
                <div className="guidance-label">Guide the Agent</div>
                <div className="guidance-input-row">
                    <input
                        type="text"
                        className="guidance-input"
                        placeholder="Give additional instructions or adjust the task..."
                        value={guidanceText}
                        onChange={(e) => setGuidanceText(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && void handleSendGuidance()}
                        disabled={!isRunning && !isPaused}
                    />
                    <button
                        className="guidance-send-btn"
                        onClick={() => void handleSendGuidance()}
                        disabled={!isRunning && !isPaused}
                        type="button"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AutonomousPanel

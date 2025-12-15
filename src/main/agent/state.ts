/**
 * Agent State Manager
 * Handles state transitions and emits events for the autonomous agent
 */
import { EventEmitter } from 'events'
import { createLogger } from '../../shared/logger'
import type {
  AgentState,
  AgentStatus,
  ProgressItem,
  PlanItem,
  AgentStateChangeEvent
} from './types'
import { DEFAULT_AGENT_STATE } from './types'

const log = createLogger('main/agent/state')

/**
 * AgentStateManager manages the lifecycle and state of the autonomous agent
 */
export class AgentStateManager extends EventEmitter {
  private state: AgentState = { ...DEFAULT_AGENT_STATE }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return { ...this.state }
  }

  /**
   * Update agent state and emit change event
   */
  private setState(updates: Partial<AgentState>): void {
    const previousState = { ...this.state }
    this.state = { ...this.state, ...updates }

    const event: AgentStateChangeEvent = {
      previousState,
      newState: { ...this.state },
      timestamp: Date.now()
    }

    log.info('Agent state changed', {
      from: previousState.status,
      to: this.state.status,
      goalId: this.state.currentGoalId
    })

    this.emit('stateChange', event)
  }

  /**
   * Start processing a goal
   */
  startGoal(goalId: string, goalText: string): void {
    if (this.state.status !== 'idle') {
      throw new Error(`Cannot start goal: agent is ${this.state.status}`)
    }

    this.setState({
      status: 'planning',
      currentGoalId: goalId,
      currentGoalText: goalText,
      currentTask: 'Planning execution steps...',
      startedAt: Date.now(),
      progress: [],
      upNext: [],
      error: null
    })
  }

  /**
   * Set the execution plan
   */
  setPlan(items: PlanItem[]): void {
    this.setState({
      status: 'executing',
      currentTask: items.length > 0 ? items[0].description : 'Executing plan...',
      upNext: items
    })
  }

  /**
   * Mark current step as complete and move to next
   */
  completeStep(description: string): void {
    const progressItem: ProgressItem = {
      id: `progress-${Date.now()}`,
      description,
      completedAt: Date.now(),
      type: 'execute'
    }

    const remainingSteps = this.state.upNext.slice(1)
    const nextTask = remainingSteps.length > 0 ? remainingSteps[0].description : null

    this.setState({
      progress: [...this.state.progress, progressItem],
      upNext: remainingSteps,
      currentTask: nextTask ?? 'Finishing up...'
    })
  }

  /**
   * Add a progress entry
   */
  addProgress(description: string, type: ProgressItem['type'] = 'execute'): void {
    const progressItem: ProgressItem = {
      id: `progress-${Date.now()}`,
      description,
      completedAt: Date.now(),
      type
    }

    this.setState({
      progress: [...this.state.progress, progressItem]
    })
  }

  /**
   * Update current task description
   */
  setCurrentTask(task: string): void {
    this.setState({ currentTask: task })
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.state.status !== 'executing') {
      throw new Error(`Cannot pause: agent is ${this.state.status}`)
    }

    this.setState({
      status: 'paused',
      currentTask: 'Paused'
    })
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.state.status !== 'paused') {
      throw new Error(`Cannot resume: agent is ${this.state.status}`)
    }

    const nextTask = this.state.upNext.length > 0
      ? this.state.upNext[0].description
      : 'Resuming...'

    this.setState({
      status: 'executing',
      currentTask: nextTask
    })
  }

  /**
   * Complete the current goal
   */
  complete(): void {
    this.setState({
      status: 'completed',
      currentTask: 'Goal completed',
      upNext: []
    })
  }

  /**
   * Set error state
   */
  setError(error: string): void {
    this.setState({
      status: 'error',
      error,
      currentTask: 'Error occurred'
    })
  }

  /**
   * Reset to idle state
   */
  reset(): void {
    this.setState({ ...DEFAULT_AGENT_STATE })
  }

  /**
   * Get status summary for UI
   */
  getStatusSummary(): { status: AgentStatus; task: string | null; progressCount: number } {
    return {
      status: this.state.status,
      task: this.state.currentTask,
      progressCount: this.state.progress.length
    }
  }
}

// Singleton instance
let stateManager: AgentStateManager | null = null

export function getAgentStateManager(): AgentStateManager {
  if (!stateManager) {
    stateManager = new AgentStateManager()
  }
  return stateManager
}

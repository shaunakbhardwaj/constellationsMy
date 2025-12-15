/**
 * Autonomous Agent
 * Main agent class that orchestrates goal processing
 */
import { createLogger } from '../../shared/logger'
import { getAgentStateManager, AgentStateManager } from './state'
import { getGoalsService } from '../goals'
import { getTool } from './tools'
import type { AgentState, PlanItem, ExecutionPlan } from './types'

const log = createLogger('main/agent')

/**
 * AutonomousAgent orchestrates the execution of goals
 */
export class AutonomousAgent {
  private stateManager: AgentStateManager
  private abortController: AbortController | null = null
  private isRunning = false

  constructor() {
    this.stateManager = getAgentStateManager()
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return this.stateManager.getState()
  }

  /**
   * Start processing a goal
   */
  async start(goalId: string): Promise<void> {
    const currentState = this.stateManager.getState()
    if (currentState.status !== 'idle' && currentState.status !== 'completed') {
      throw new Error(`Cannot start: agent is ${currentState.status}`)
    }

    // Get the goal from the database
    const goalsService = getGoalsService()
    const goal = goalsService.getGoal(goalId)

    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`)
    }

    log.info('Agent starting goal', { goalId, goalText: goal.text.substring(0, 50) })

    // Create abort controller for this run
    this.abortController = new AbortController()
    this.isRunning = true

    // Update goal status
    goalsService.updateGoal(goalId, { status: 'in_progress' })
    goalsService.enableAutonomous(goalId)

    // Start the agent
    this.stateManager.startGoal(goalId, goal.text)

    // Create a simple plan (in Phase 4, this will use LLM)
    const plan = this.createSimplePlan(goalId, goal.text)
    this.stateManager.setPlan(plan.steps.map((step, i) => ({
      id: step.id,
      description: step.description,
      type: step.tool as PlanItem['type'],
      order: i
    })))

    // Execute the plan
    try {
      await this.executePlan(plan)

      // Mark as complete
      this.stateManager.complete()
      goalsService.updateGoal(goalId, { status: 'completed' })

      log.info('Agent completed goal', { goalId })
    } catch (error) {
      if ((error as Error).message === 'Aborted') {
        log.info('Agent aborted', { goalId })
        return
      }

      log.error('Agent failed', { goalId, error })
      this.stateManager.setError(
        error instanceof Error ? error.message : 'Unknown error'
      )
    } finally {
      this.isRunning = false
      this.abortController = null
    }
  }

  /**
   * Create a simple plan without LLM (Phase 4 will use LLM planning)
   */
  private createSimplePlan(goalId: string, goalText: string): ExecutionPlan {
    // Simple heuristic: search for relevant content, then summarize
    const steps = [
      {
        id: `step-${Date.now()}-1`,
        order: 1,
        tool: 'search',
        params: { query: goalText, limit: 5 },
        description: `Search for content related to: "${goalText.substring(0, 50)}..."`,
        status: 'pending' as const
      },
      {
        id: `step-${Date.now()}-2`,
        order: 2,
        tool: 'analyze',
        params: { content: 'search results', focus: 'key insights' },
        description: 'Analyze search results for key insights',
        status: 'pending' as const
      },
      {
        id: `step-${Date.now()}-3`,
        order: 3,
        tool: 'summarize',
        params: { content: 'analysis results', style: 'brief' },
        description: 'Create summary of findings',
        status: 'pending' as const
      }
    ]

    return {
      goalId,
      steps,
      createdAt: Date.now()
    }
  }

  /**
   * Execute an execution plan
   */
  private async executePlan(plan: ExecutionPlan): Promise<void> {
    for (const step of plan.steps) {
      // Check for abort
      if (this.abortController?.signal.aborted) {
        throw new Error('Aborted')
      }

      // Check for pause
      while (this.stateManager.getState().status === 'paused') {
        await this.sleep(500)
        if (this.abortController?.signal.aborted) {
          throw new Error('Aborted')
        }
      }

      log.info('Executing step', { stepId: step.id, tool: step.tool })

      // Update status
      this.stateManager.setCurrentTask(step.description)

      // Get and execute tool
      const tool = getTool(step.tool)
      if (!tool) {
        log.warn('Tool not found, skipping', { tool: step.tool })
        continue
      }

      const result = await tool.execute(step.params)

      // Record progress
      step.status = result.success ? 'completed' : 'failed'
      step.result = result

      this.stateManager.addProgress(
        `${step.description}: ${result.success ? 'Success' : 'Failed'}`
      )

      // Update remaining steps
      const remainingSteps = plan.steps
        .filter(s => s.status === 'pending')
        .map((s, i) => ({
          id: s.id,
          description: s.description,
          type: s.tool as PlanItem['type'],
          order: i
        }))

      if (remainingSteps.length === 0) {
        this.stateManager.setCurrentTask('Finishing up...')
      }

      // Small delay between steps
      await this.sleep(500)
    }
  }

  /**
   * Pause execution
   */
  pause(): void {
    this.stateManager.pause()
    log.info('Agent paused')
  }

  /**
   * Resume execution
   */
  resume(): void {
    this.stateManager.resume()
    log.info('Agent resumed')
  }

  /**
   * Stop and reset the agent
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.stateManager.reset()
    this.isRunning = false
    log.info('Agent stopped')
  }

  /**
   * Send user guidance (placeholder for Phase 4)
   */
  async sendGuidance(guidance: string): Promise<void> {
    log.info('Guidance received (placeholder)', { guidance })
    // In Phase 4, this will modify the plan using LLM
    this.stateManager.addProgress(`User guidance: "${guidance.substring(0, 50)}..."`, 'verify')
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: AgentState) => void): () => void {
    const handler = (event: { newState: AgentState }) => callback(event.newState)
    this.stateManager.on('stateChange', handler)
    return () => this.stateManager.off('stateChange', handler)
  }

  /**
   * Check if agent is running
   */
  isActive(): boolean {
    return this.isRunning
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Singleton instance
let agent: AutonomousAgent | null = null

export function getAutonomousAgent(): AutonomousAgent {
  if (!agent) {
    agent = new AutonomousAgent()
  }
  return agent
}

export * from './types'
export * from './state'

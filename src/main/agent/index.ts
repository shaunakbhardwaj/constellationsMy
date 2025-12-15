/**
 * Autonomous Agent
 * Main agent class that orchestrates goal processing with LLM support
 */
import { createLogger } from '../../shared/logger'
import { getAgentStateManager, AgentStateManager } from './state'
import { getGoalsService } from '../goals'
import { getTool } from './tools'
import { getAgentPlanner, AgentPlanner } from './planner'
import { getGuidanceProcessor, GuidanceProcessor } from './guidance'
import type { AgentState, PlanItem, ExecutionPlan, PlanStep } from './types'

const log = createLogger('main/agent')

/**
 * AutonomousAgent orchestrates the execution of goals
 */
export class AutonomousAgent {
  private stateManager: AgentStateManager
  private planner: AgentPlanner
  private guidanceProcessor: GuidanceProcessor
  private abortController: AbortController | null = null
  private isRunning = false
  private currentPlan: ExecutionPlan | null = null
  private currentStepIndex = 0
  private pendingGuidance: string | null = null

  constructor() {
    this.stateManager = getAgentStateManager()
    this.planner = getAgentPlanner()
    this.guidanceProcessor = getGuidanceProcessor()
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
    this.currentStepIndex = 0

    // Update goal status
    goalsService.updateGoal(goalId, { status: 'in_progress' })
    goalsService.enableAutonomous(goalId)

    // Start the agent
    this.stateManager.startGoal(goalId, goal.text)

    try {
      // Create plan using LLM planner (with fallback)
      this.currentPlan = await this.planner.createPlan(goalId, goal.text)

      // Update UI with plan
      this.stateManager.setPlan(this.currentPlan.steps.map((step, i) => ({
        id: step.id,
        description: step.description,
        type: step.tool as PlanItem['type'],
        order: i
      })))

      // Execute the plan
      await this.executePlan()

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
      this.currentPlan = null
    }
  }

  /**
   * Execute the current plan
   */
  private async executePlan(): Promise<void> {
    if (!this.currentPlan) return

    let lastSearchResults: unknown = null

    for (let i = this.currentStepIndex; i < this.currentPlan.steps.length; i++) {
      const step = this.currentPlan.steps[i]
      this.currentStepIndex = i

      // Check for abort
      if (this.abortController?.signal.aborted) {
        throw new Error('Aborted')
      }

      // Check for pending guidance
      await this.handlePendingGuidance()

      // Check for pause
      while (this.stateManager.getState().status === 'paused') {
        await this.sleep(500)
        if (this.abortController?.signal.aborted) {
          throw new Error('Aborted')
        }
      }

      // Skip already processed steps
      if (step.status === 'completed' || step.status === 'skipped') {
        continue
      }

      log.info('Executing step', { stepId: step.id, tool: step.tool })

      // Update status
      this.stateManager.setCurrentTask(step.description)

      // Get and execute tool
      const tool = getTool(step.tool)
      if (!tool) {
        log.warn('Tool not found, skipping', { tool: step.tool })
        step.status = 'skipped'
        continue
      }

      // Prepare params - inject previous results if needed
      const params = this.prepareParams(step, lastSearchResults)
      const result = await tool.execute(params)

      // Store search results for subsequent steps
      if (step.tool === 'search' && result.data) {
        lastSearchResults = result.data
      }

      // Record progress
      step.status = result.success ? 'completed' : 'failed'
      step.result = result

      this.stateManager.addProgress(
        `${step.description}: ${result.success ? 'Success' : 'Failed'}`
      )

      // Update remaining steps in UI
      this.updateRemainingSteps()

      // Small delay between steps
      await this.sleep(500)
    }
  }

  /**
   * Prepare step params, injecting context from previous steps
   */
  private prepareParams(
    step: PlanStep,
    lastSearchResults: unknown
  ): Record<string, unknown> {
    const params = { ...step.params }

    // If content param references search results, inject them
    if (params.content === 'search_results' || params.content === 'search results') {
      if (lastSearchResults && typeof lastSearchResults === 'object') {
        const results = (lastSearchResults as { results?: { text: string }[] }).results
        if (results) {
          params.content = results.map(r => r.text).join('\n\n')
        }
      }
    }

    return params
  }

  /**
   * Handle any pending user guidance
   */
  private async handlePendingGuidance(): Promise<void> {
    if (!this.pendingGuidance || !this.currentPlan) return

    const guidance = this.pendingGuidance
    this.pendingGuidance = null

    const currentStep = this.currentPlan.steps[this.currentStepIndex] ?? null
    const remainingSteps = this.currentPlan.steps.slice(this.currentStepIndex + 1)

    const action = await this.guidanceProcessor.processGuidance(
      guidance,
      this.currentPlan.goalId,
      currentStep,
      remainingSteps
    )

    log.info('Guidance action', { action: action.action, reason: action.reason })

    this.stateManager.addProgress(`Guidance: ${action.reason}`, 'verify')

    switch (action.action) {
      case 'pause':
        this.pause()
        break
      case 'skip_step':
        if (currentStep) {
          currentStep.status = 'skipped'
        }
        break
      case 'modify_plan':
        if (action.details?.modifiedPlan) {
          // Revise remaining steps
          const completedSteps = this.currentPlan.steps
            .slice(0, this.currentStepIndex + 1)
            .map(s => s.id)
          this.currentPlan = await this.planner.revisePlan(
            this.currentPlan,
            guidance,
            completedSteps
          )
          this.updateRemainingSteps()
        }
        break
      case 'add_step':
        if (action.details?.newSteps) {
          this.currentPlan = this.guidanceProcessor.addSteps(
            this.currentPlan,
            action.details.newSteps,
            this.currentStepIndex
          )
          this.updateRemainingSteps()
        }
        break
    }
  }

  /**
   * Update UI with remaining steps
   */
  private updateRemainingSteps(): void {
    if (!this.currentPlan) return

    const remainingSteps = this.currentPlan.steps
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
    this.currentPlan = null
    log.info('Agent stopped')
  }

  /**
   * Send user guidance to modify execution
   */
  async sendGuidance(guidance: string): Promise<void> {
    log.info('Guidance received', { guidance: guidance.substring(0, 50) })

    if (!this.isRunning) {
      log.warn('Agent not running, ignoring guidance')
      return
    }

    // Queue guidance for processing
    this.pendingGuidance = guidance
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

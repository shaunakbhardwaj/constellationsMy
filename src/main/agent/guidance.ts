/**
 * Guidance Processor
 * Processes user guidance to modify agent execution
 */
import { createLogger } from '../../shared/logger'
import { getLLMService, LLMService } from '../llm'
import { GUIDANCE_SYSTEM_PROMPT, getGuidancePrompt } from './prompts/guidance'
import type { ExecutionPlan, PlanStep } from './types'

const log = createLogger('main/agent/guidance')

/**
 * Guidance action types
 */
export type GuidanceActionType = 'continue' | 'modify_plan' | 'pause' | 'skip_step' | 'add_step'

/**
 * Parsed guidance action from LLM
 */
export interface GuidanceAction {
  action: GuidanceActionType
  reason: string
  details?: {
    stepId?: string
    newSteps?: Partial<PlanStep>[]
    modifiedPlan?: Partial<PlanStep>[]
  }
}

/**
 * GuidanceProcessor analyzes user guidance and determines actions
 */
export class GuidanceProcessor {
  private llm: LLMService

  constructor() {
    this.llm = getLLMService()
  }

  /**
   * Process user guidance and determine action
   */
  async processGuidance(
    guidance: string,
    originalGoal: string,
    currentStep: PlanStep | null,
    remainingSteps: PlanStep[]
  ): Promise<GuidanceAction> {
    log.info('Processing guidance', { guidance: guidance.substring(0, 50) })

    // Simple heuristic matching first (for common patterns)
    const simpleAction = this.matchSimplePatterns(guidance)
    if (simpleAction) {
      return simpleAction
    }

    // Use LLM for complex guidance
    if (!this.llm.isReady()) {
      log.warn('LLM not ready, defaulting to continue')
      return {
        action: 'continue',
        reason: 'LLM not configured, continuing with current plan'
      }
    }

    try {
      const prompt = getGuidancePrompt(
        originalGoal,
        currentStep?.description ?? 'No current step',
        remainingSteps.map(s => s.description),
        guidance
      )

      const result = await this.llm.generateJSON<GuidanceAction>(
        prompt,
        GUIDANCE_SYSTEM_PROMPT
      )

      log.info('Guidance processed', { action: result.action, reason: result.reason })

      return result
    } catch (error) {
      log.error('Guidance processing failed', { error })
      return {
        action: 'continue',
        reason: 'Failed to process guidance, continuing with current plan'
      }
    }
  }

  /**
   * Match simple patterns without LLM
   */
  private matchSimplePatterns(guidance: string): GuidanceAction | null {
    const lower = guidance.toLowerCase().trim()

    // Pause patterns
    if (lower === 'pause' || lower === 'stop' || lower === 'wait') {
      return {
        action: 'pause',
        reason: 'User requested pause'
      }
    }

    // Skip patterns
    if (lower.startsWith('skip')) {
      return {
        action: 'skip_step',
        reason: 'User requested skip'
      }
    }

    // Continue patterns
    if (lower === 'continue' || lower === 'ok' || lower === 'proceed') {
      return {
        action: 'continue',
        reason: 'User confirmed continuation'
      }
    }

    // No simple match
    return null
  }

  /**
   * Apply a skip action to the plan
   */
  applySkip(plan: ExecutionPlan, currentStepIndex: number): ExecutionPlan {
    const steps = plan.steps.map((step, index) => {
      if (index === currentStepIndex) {
        return { ...step, status: 'skipped' as const }
      }
      return step
    })

    return { ...plan, steps }
  }

  /**
   * Apply new steps to the plan
   */
  addSteps(
    plan: ExecutionPlan,
    newSteps: Partial<PlanStep>[],
    insertAfterIndex: number
  ): ExecutionPlan {
    const fullNewSteps: PlanStep[] = newSteps.map((step, i) => ({
      id: step.id ?? `inserted_${Date.now()}_${i}`,
      order: insertAfterIndex + i + 2,
      tool: step.tool ?? 'search',
      params: step.params ?? {},
      description: step.description ?? 'Added step',
      status: 'pending' as const
    }))

    const steps = [
      ...plan.steps.slice(0, insertAfterIndex + 1),
      ...fullNewSteps,
      ...plan.steps.slice(insertAfterIndex + 1)
    ]

    // Re-number orders
    steps.forEach((step, i) => {
      step.order = i + 1
    })

    return { ...plan, steps }
  }
}

// Singleton instance
let processor: GuidanceProcessor | null = null

export function getGuidanceProcessor(): GuidanceProcessor {
  if (!processor) {
    processor = new GuidanceProcessor()
  }
  return processor
}

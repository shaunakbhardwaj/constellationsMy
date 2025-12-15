/**
 * Agent Planner
 * LLM-powered planning for goal execution
 */
import { createLogger } from '../../shared/logger'
import { getLLMService, LLMService } from '../llm'
import { getSQLite } from '../db/sqlite'
import { getAvailableTools, toolRegistry } from './tools'
import { PLANNER_SYSTEM_PROMPT, getPlanningPrompt, getRevisionPrompt } from './prompts/planning'
import type { ExecutionPlan, PlanStep } from './types'

const log = createLogger('main/agent/planner')

/**
 * Parsed plan step from LLM response
 */
interface ParsedStep {
  id: string
  tool: string
  params: Record<string, unknown>
  description: string
}

/**
 * AgentPlanner creates execution plans using LLM
 */
export class AgentPlanner {
  private llm: LLMService

  constructor() {
    this.llm = getLLMService()
  }

  /**
   * Create an execution plan for a goal
   */
  async createPlan(goalId: string, goalText: string): Promise<ExecutionPlan> {
    log.info('Creating plan', { goalId, goalText: goalText.substring(0, 50) })

    // Get available files for context
    const files = this.getAvailableFiles()

    // Get tool descriptions
    const tools = Object.entries(toolRegistry).map(([name, tool]) => ({
      name,
      description: tool.description
    }))

    // Check if LLM is available
    if (!this.llm.isReady()) {
      log.warn('LLM not ready, falling back to simple plan')
      return this.createSimplePlan(goalId, goalText)
    }

    try {
      // Generate plan using LLM
      const prompt = getPlanningPrompt(goalText, files, tools)
      const steps = await this.llm.generateJSON<ParsedStep[]>(prompt, PLANNER_SYSTEM_PROMPT)

      // Validate and convert to PlanSteps
      const planSteps = this.validateAndConvertSteps(steps)

      log.info('Plan created', { goalId, stepCount: planSteps.length })

      return {
        goalId,
        goalText,
        steps: planSteps,
        createdAt: Date.now()
      }
    } catch (error) {
      log.error('LLM planning failed, falling back to simple plan', { error })
      return this.createSimplePlan(goalId, goalText)
    }
  }

  /**
   * Revise a plan based on user guidance
   */
  async revisePlan(
    plan: ExecutionPlan,
    guidance: string,
    completedStepIds: string[]
  ): Promise<ExecutionPlan> {
    log.info('Revising plan', { goalId: plan.goalId, guidance: guidance.substring(0, 50) })

    if (!this.llm.isReady()) {
      log.warn('LLM not ready, cannot revise plan')
      return plan
    }

    try {
      const prompt = getRevisionPrompt(
        plan.goalText,
        plan.steps.map(s => ({ id: s.id, tool: s.tool, description: s.description })),
        completedStepIds,
        guidance
      )

      const steps = await this.llm.generateJSON<ParsedStep[]>(prompt, PLANNER_SYSTEM_PROMPT)
      const planSteps = this.validateAndConvertSteps(steps)

      log.info('Plan revised', { goalId: plan.goalId, stepCount: planSteps.length })

      return {
        ...plan,
        steps: planSteps,
        revisedAt: Date.now()
      }
    } catch (error) {
      log.error('Plan revision failed', { error })
      return plan
    }
  }

  /**
   * Create a simple fallback plan without LLM
   */
  private createSimplePlan(goalId: string, goalText: string): ExecutionPlan {
    const steps: PlanStep[] = [
      {
        id: 'step_1',
        order: 1,
        tool: 'search',
        params: { query: goalText, limit: 5 },
        description: `Search for relevant content`,
        status: 'pending'
      },
      {
        id: 'step_2',
        order: 2,
        tool: 'analyze',
        params: { content: 'search_results', focus: 'key insights' },
        description: 'Analyze search results',
        status: 'pending'
      },
      {
        id: 'step_3',
        order: 3,
        tool: 'summarize',
        params: { content: 'analysis', style: 'brief' },
        description: 'Create summary of findings',
        status: 'pending'
      }
    ]

    return {
      goalId,
      goalText,
      steps,
      createdAt: Date.now()
    }
  }

  /**
   * Validate and convert parsed steps to PlanSteps
   */
  private validateAndConvertSteps(parsed: ParsedStep[]): PlanStep[] {
    const validTools = new Set(getAvailableTools())

    return parsed
      .filter(step => {
        // Validate tool exists
        if (!validTools.has(step.tool)) {
          log.warn('Unknown tool in plan, skipping', { tool: step.tool })
          return false
        }
        return true
      })
      .map((step, index) => ({
        id: step.id || `step_${index + 1}`,
        order: index + 1,
        tool: step.tool,
        params: step.params || {},
        description: step.description || `Execute ${step.tool}`,
        status: 'pending' as const
      }))
  }

  /**
   * Get list of available files for context
   */
  private getAvailableFiles(): string[] {
    try {
      const db = getSQLite()
      const rows = db.prepare(`
        SELECT relative_path FROM files 
        WHERE indexed_status = 'indexed'
        ORDER BY last_indexed_at DESC
        LIMIT 50
      `).all() as { relative_path: string }[]

      return rows.map(r => r.relative_path)
    } catch {
      return []
    }
  }
}

// Singleton instance
let planner: AgentPlanner | null = null

export function getAgentPlanner(): AgentPlanner {
  if (!planner) {
    planner = new AgentPlanner()
  }
  return planner
}

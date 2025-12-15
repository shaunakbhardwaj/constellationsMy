/**
 * Tests for AgentPlanner
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock LLM service
const mockLLMService = {
  isReady: vi.fn(),
  generateJSON: vi.fn()
}

vi.mock('../../llm', () => ({
  getLLMService: () => mockLLMService
}))

// Mock database
const mockDb = {
  prepare: vi.fn().mockReturnThis(),
  all: vi.fn().mockReturnValue([])
}

vi.mock('../../db/sqlite', () => ({
  getSQLite: () => mockDb
}))

// Import after mocking
import { AgentPlanner } from '../planner'

describe('AgentPlanner', () => {
  let planner: AgentPlanner

  beforeEach(() => {
    vi.clearAllMocks()
    planner = new AgentPlanner()
  })

  describe('createPlan', () => {
    it('should create a simple plan when LLM is not ready', async () => {
      mockLLMService.isReady.mockReturnValue(false)

      const plan = await planner.createPlan('goal-1', 'Find information about sales')

      expect(plan).toBeDefined()
      expect(plan.goalId).toBe('goal-1')
      expect(plan.steps).toHaveLength(3)
      expect(plan.steps[0].tool).toBe('search')
      expect(plan.steps[1].tool).toBe('analyze')
      expect(plan.steps[2].tool).toBe('summarize')
    })

    it('should use LLM to generate plan when ready', async () => {
      mockLLMService.isReady.mockReturnValue(true)
      mockLLMService.generateJSON.mockResolvedValue([
        { id: 'step_1', tool: 'search', params: { query: 'sales data' }, description: 'Search for sales' },
        { id: 'step_2', tool: 'summarize', params: { content: 'results' }, description: 'Summarize' }
      ])

      const plan = await planner.createPlan('goal-2', 'Summarize sales data')

      expect(plan).toBeDefined()
      expect(plan.steps).toHaveLength(2)
      expect(mockLLMService.generateJSON).toHaveBeenCalled()
    })

    it('should fall back to simple plan if LLM fails', async () => {
      mockLLMService.isReady.mockReturnValue(true)
      mockLLMService.generateJSON.mockRejectedValue(new Error('LLM error'))

      const plan = await planner.createPlan('goal-3', 'Some goal')

      expect(plan).toBeDefined()
      expect(plan.steps).toHaveLength(3) // Fallback 3-step plan
    })

    it('should filter out steps with unknown tools', async () => {
      mockLLMService.isReady.mockReturnValue(true)
      mockLLMService.generateJSON.mockResolvedValue([
        { id: 'step_1', tool: 'search', params: {}, description: 'Search' },
        { id: 'step_2', tool: 'unknown_tool', params: {}, description: 'Unknown' },
        { id: 'step_3', tool: 'summarize', params: {}, description: 'Summarize' }
      ])

      const plan = await planner.createPlan('goal-4', 'Test goal')

      expect(plan.steps).toHaveLength(2)
      expect(plan.steps.map(s => s.tool)).toEqual(['search', 'summarize'])
    })
  })

  describe('revisePlan', () => {
    const basePlan = {
      goalId: 'goal-1',
      steps: [
        { id: 'step_1', order: 1, tool: 'search', params: {}, description: 'Search', status: 'completed' as const },
        { id: 'step_2', order: 2, tool: 'analyze', params: {}, description: 'Analyze', status: 'pending' as const }
      ],
      createdAt: Date.now()
    }

    it('should return original plan if LLM not ready', async () => {
      mockLLMService.isReady.mockReturnValue(false)

      const revised = await planner.revisePlan(basePlan, 'skip analysis', ['step_1'])

      expect(revised).toEqual(basePlan)
    })

    it('should revise plan with LLM when ready', async () => {
      mockLLMService.isReady.mockReturnValue(true)
      mockLLMService.generateJSON.mockResolvedValue([
        { id: 'step_1', tool: 'search', params: {}, description: 'Search' },
        { id: 'step_3', tool: 'summarize', params: {}, description: 'New summarize step' }
      ])

      const revised = await planner.revisePlan(basePlan, 'skip analysis, just summarize', ['step_1'])

      expect(revised.steps).toHaveLength(2)
      expect(revised.revisedAt).toBeDefined()
    })
  })
})

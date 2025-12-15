/**
 * Tests for GuidanceProcessor
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

// Import after mocking
import { GuidanceProcessor } from '../guidance'
import type { PlanStep, ExecutionPlan } from '../types'

describe('GuidanceProcessor', () => {
  let processor: GuidanceProcessor

  beforeEach(() => {
    vi.clearAllMocks()
    processor = new GuidanceProcessor()
  })

  const createMockStep = (id: string, status: 'pending' | 'completed' | 'skipped' = 'pending'): PlanStep => ({
    id,
    order: 1,
    tool: 'search',
    params: {},
    description: `Step ${id}`,
    status
  })

  describe('processGuidance - Simple patterns', () => {
    it('should recognize "pause" command', async () => {
      const result = await processor.processGuidance('pause', 'goal', null, [])

      expect(result.action).toBe('pause')
    })

    it('should recognize "stop" command', async () => {
      const result = await processor.processGuidance('stop', 'goal', null, [])

      expect(result.action).toBe('pause')
    })

    it('should recognize "skip" command', async () => {
      const result = await processor.processGuidance('skip this step', 'goal', null, [])

      expect(result.action).toBe('skip_step')
    })

    it('should recognize "continue" command', async () => {
      const result = await processor.processGuidance('continue', 'goal', null, [])

      expect(result.action).toBe('continue')
    })

    it('should recognize "ok" as continue', async () => {
      const result = await processor.processGuidance('ok', 'goal', null, [])

      expect(result.action).toBe('continue')
    })
  })

  describe('processGuidance - Complex patterns with LLM', () => {
    it('should use LLM for complex guidance', async () => {
      mockLLMService.isReady.mockReturnValue(true)
      mockLLMService.generateJSON.mockResolvedValue({
        action: 'modify_plan',
        reason: 'User wants to focus on specific topic'
      })

      const result = await processor.processGuidance(
        'Actually, focus on revenue data only',
        'Analyze sales',
        createMockStep('step_1'),
        [createMockStep('step_2')]
      )

      expect(result.action).toBe('modify_plan')
      expect(mockLLMService.generateJSON).toHaveBeenCalled()
    })

    it('should fallback to continue if LLM not ready', async () => {
      mockLLMService.isReady.mockReturnValue(false)

      const result = await processor.processGuidance(
        'Focus on revenue only',
        'Analyze sales',
        createMockStep('step_1'),
        []
      )

      expect(result.action).toBe('continue')
    })

    it('should fallback to continue if LLM fails', async () => {
      mockLLMService.isReady.mockReturnValue(true)
      mockLLMService.generateJSON.mockRejectedValue(new Error('LLM error'))

      const result = await processor.processGuidance(
        'Complex request that needs LLM',
        'Some goal',
        null,
        []
      )

      expect(result.action).toBe('continue')
    })
  })

  describe('applySkip', () => {
    it('should mark current step as skipped', () => {
      const plan: ExecutionPlan = {
        goalId: 'goal-1',
        steps: [
          createMockStep('step_1', 'completed'),
          createMockStep('step_2', 'pending'),
          createMockStep('step_3', 'pending')
        ],
        createdAt: Date.now()
      }

      const result = processor.applySkip(plan, 1)

      expect(result.steps[0].status).toBe('completed')
      expect(result.steps[1].status).toBe('skipped')
      expect(result.steps[2].status).toBe('pending')
    })
  })

  describe('addSteps', () => {
    it('should insert new steps after specified index', () => {
      const plan: ExecutionPlan = {
        goalId: 'goal-1',
        steps: [
          createMockStep('step_1'),
          createMockStep('step_3')
        ],
        createdAt: Date.now()
      }

      const newSteps = [{ tool: 'analyze', description: 'New analyze step' }]

      const result = processor.addSteps(plan, newSteps, 0)

      expect(result.steps).toHaveLength(3)
      expect(result.steps[1].tool).toBe('analyze')
      expect(result.steps[1].description).toBe('New analyze step')
    })

    it('should renumber step orders correctly', () => {
      const plan: ExecutionPlan = {
        goalId: 'goal-1',
        steps: [
          { ...createMockStep('step_1'), order: 1 },
          { ...createMockStep('step_2'), order: 2 }
        ],
        createdAt: Date.now()
      }

      const newSteps = [{ tool: 'summarize', description: 'Inserted' }]

      const result = processor.addSteps(plan, newSteps, 0)

      expect(result.steps[0].order).toBe(1)
      expect(result.steps[1].order).toBe(2)
      expect(result.steps[2].order).toBe(3)
    })
  })
})

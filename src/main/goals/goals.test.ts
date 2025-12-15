/**
 * Tests for GoalsService
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock database
const mockDb = {
  prepare: vi.fn().mockReturnThis(),
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn()
}

vi.mock('../../main/db', () => ({
  getSQLite: () => mockDb
}))

// Import after mocking
import { GoalsService } from '../../main/goals'

describe('GoalsService', () => {
  let service: GoalsService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GoalsService()
  })

  describe('createGoal', () => {
    it('should create a new goal with defaults', () => {
      mockDb.get.mockReturnValue({
        id: 'test-id',
        text: 'Test goal',
        status: 'pending',
        priority: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
        autonomous_enabled: 0
      })

      const goal = service.createGoal({ text: 'Test goal' })

      expect(goal).toBeDefined()
      expect(goal.text).toBe('Test goal')
      expect(goal.status).toBe('pending')
      expect(mockDb.prepare).toHaveBeenCalled()
    })

    it('should accept priority in create request', () => {
      mockDb.get.mockReturnValue({
        id: 'test-id',
        text: 'High priority goal',
        status: 'pending',
        priority: 10,
        created_at: Date.now(),
        updated_at: Date.now(),
        autonomous_enabled: 0
      })

      const goal = service.createGoal({ text: 'High priority goal', priority: 10 })

      expect(goal.priority).toBe(10)
    })
  })

  describe('getGoals', () => {
    it('should return all goals', () => {
      mockDb.all.mockReturnValue([
        { id: '1', text: 'Goal 1', status: 'pending', priority: 0, created_at: 1, updated_at: 1, autonomous_enabled: 0 },
        { id: '2', text: 'Goal 2', status: 'completed', priority: 1, created_at: 2, updated_at: 2, autonomous_enabled: 1 }
      ])

      const goals = service.getGoals()

      expect(goals).toHaveLength(2)
      expect(goals[0].text).toBe('Goal 1')
      expect(goals[1].text).toBe('Goal 2')
    })

    it('should return empty array when no goals', () => {
      mockDb.all.mockReturnValue([])

      const goals = service.getGoals()

      expect(goals).toHaveLength(0)
    })
  })

  describe('updateGoal', () => {
    it('should update goal text', () => {
      mockDb.get.mockReturnValue({
        id: 'test-id',
        text: 'Updated text',
        status: 'pending',
        priority: 0,
        created_at: 1,
        updated_at: Date.now(),
        autonomous_enabled: 0
      })

      const goal = service.updateGoal('test-id', { text: 'Updated text' })

      expect(goal).toBeDefined()
      expect(goal!.text).toBe('Updated text')
    })

    it('should return null for non-existent goal', () => {
      mockDb.get.mockReturnValue(undefined)

      const goal = service.updateGoal('non-existent', { text: 'Test' })

      expect(goal).toBeNull()
    })
  })

  describe('deleteGoal', () => {
    it('should delete goal and return true', () => {
      mockDb.run.mockReturnValue({ changes: 1 })

      const result = service.deleteGoal('test-id')

      expect(result).toBe(true)
    })

    it('should return false if goal not found', () => {
      mockDb.run.mockReturnValue({ changes: 0 })

      const result = service.deleteGoal('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('toggleComplete', () => {
    it('should toggle pending to completed', () => {
      // First call gets current status
      mockDb.get.mockReturnValueOnce({
        id: 'test-id',
        text: 'Test',
        status: 'pending',
        priority: 0,
        created_at: 1,
        updated_at: 1,
        autonomous_enabled: 0
      })
      // Second call returns updated goal
      mockDb.get.mockReturnValueOnce({
        id: 'test-id',
        text: 'Test',
        status: 'completed',
        priority: 0,
        created_at: 1,
        updated_at: Date.now(),
        autonomous_enabled: 0
      })

      const goal = service.toggleComplete('test-id')

      expect(goal).toBeDefined()
      expect(goal!.status).toBe('completed')
    })

    it('should toggle completed to pending', () => {
      mockDb.get.mockReturnValueOnce({
        id: 'test-id',
        text: 'Test',
        status: 'completed',
        priority: 0,
        created_at: 1,
        updated_at: 1,
        autonomous_enabled: 0
      })
      mockDb.get.mockReturnValueOnce({
        id: 'test-id',
        text: 'Test',
        status: 'pending',
        priority: 0,
        created_at: 1,
        updated_at: Date.now(),
        autonomous_enabled: 0
      })

      const goal = service.toggleComplete('test-id')

      expect(goal).toBeDefined()
      expect(goal!.status).toBe('pending')
    })
  })
})

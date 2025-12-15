/**
 * IPC Handlers for Goals
 */
import { ipcMain } from 'electron'
import { getGoalsService } from '../../goals'
import { createLogger } from '../../../shared/logger'
import type { CreateGoalRequest, UpdateGoalRequest } from '../../goals/types'

const log = createLogger('ipc/goals')

export function registerGoalsHandlers(): void {
  // Get all goals
  ipcMain.handle('get-goals', async () => {
    try {
      const service = getGoalsService()
      const goals = service.getGoals()
      log.info('get-goals success', { count: goals.length })
      return { success: true, goals }
    } catch (error) {
      log.error('get-goals failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get goals'
      }
    }
  })

  // Create a goal
  ipcMain.handle('create-goal', async (_, request: CreateGoalRequest) => {
    try {
      const service = getGoalsService()
      const goal = service.createGoal(request)
      log.info('create-goal success', { id: goal.id })
      return { success: true, goal }
    } catch (error) {
      log.error('create-goal failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create goal'
      }
    }
  })

  // Update a goal
  ipcMain.handle(
    'update-goal',
    async (_, id: string, updates: UpdateGoalRequest) => {
      try {
        const service = getGoalsService()
        const goal = service.updateGoal(id, updates)
        if (!goal) {
          return { success: false, error: 'Goal not found' }
        }
        log.info('update-goal success', { id })
        return { success: true, goal }
      } catch (error) {
        log.error('update-goal failed', { error })
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update goal'
        }
      }
    }
  )

  // Delete a goal
  ipcMain.handle('delete-goal', async (_, id: string) => {
    try {
      const service = getGoalsService()
      const deleted = service.deleteGoal(id)
      if (!deleted) {
        return { success: false, error: 'Goal not found' }
      }
      log.info('delete-goal success', { id })
      return { success: true }
    } catch (error) {
      log.error('delete-goal failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete goal'
      }
    }
  })

  // Toggle goal completion
  ipcMain.handle('toggle-goal-complete', async (_, id: string) => {
    try {
      const service = getGoalsService()
      const goal = service.toggleComplete(id)
      if (!goal) {
        return { success: false, error: 'Goal not found' }
      }
      log.info('toggle-goal-complete success', { id, newStatus: goal.status })
      return { success: true, goal }
    } catch (error) {
      log.error('toggle-goal-complete failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to toggle goal'
      }
    }
  })

  // Enable autonomous processing
  ipcMain.handle('enable-goal-autonomous', async (_, id: string) => {
    try {
      const service = getGoalsService()
      const goal = service.enableAutonomous(id)
      if (!goal) {
        return { success: false, error: 'Goal not found' }
      }
      log.info('enable-goal-autonomous success', { id })
      return { success: true, goal }
    } catch (error) {
      log.error('enable-goal-autonomous failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enable autonomous'
      }
    }
  })

  // Disable autonomous processing
  ipcMain.handle('disable-goal-autonomous', async (_, id: string) => {
    try {
      const service = getGoalsService()
      const goal = service.disableAutonomous(id)
      if (!goal) {
        return { success: false, error: 'Goal not found' }
      }
      log.info('disable-goal-autonomous success', { id })
      return { success: true, goal }
    } catch (error) {
      log.error('disable-goal-autonomous failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disable autonomous'
      }
    }
  })

  // Get goal progress
  ipcMain.handle('get-goal-progress', async (_, goalId: string) => {
    try {
      const service = getGoalsService()
      const progress = service.getProgress(goalId)
      log.info('get-goal-progress success', { goalId, count: progress.length })
      return { success: true, progress }
    } catch (error) {
      log.error('get-goal-progress failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get progress'
      }
    }
  })

  log.info('Goals handlers registered')
}

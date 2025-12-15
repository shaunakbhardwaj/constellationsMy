/**
 * Goals Service - CRUD operations for user goals
 */
import { v4 as uuidv4 } from 'uuid'
import { getSQLite } from '../db/sqlite'
import { createLogger } from '../../shared/logger'
import type {
  Goal,
  GoalProgress,
  GoalStatus,
  CreateGoalRequest,
  UpdateGoalRequest
} from './types'

const log = createLogger('main/goals')

/**
 * Maps a database row to a Goal object
 */
function rowToGoal(row: Record<string, unknown>): Goal {
  return {
    id: row.id as string,
    text: row.text as string,
    status: row.status as GoalStatus,
    priority: row.priority as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    completedAt: row.completed_at as number | null,
    autonomousEnabled: Boolean(row.autonomous_enabled),
    autonomousStartedAt: row.autonomous_started_at as number | null,
    autonomousCompletedAt: row.autonomous_completed_at as number | null
  }
}

/**
 * Maps a database row to a GoalProgress object
 */
function rowToProgress(row: Record<string, unknown>): GoalProgress {
  return {
    id: row.id as string,
    goalId: row.goal_id as string,
    stepType: row.step_type as GoalProgress['stepType'],
    description: row.description as string,
    status: row.status as GoalProgress['status'],
    output: row.output as string | null,
    createdAt: row.created_at as number,
    completedAt: row.completed_at as number | null
  }
}

/**
 * GoalsService provides CRUD operations for goals
 */
export class GoalsService {
  /**
   * Create a new goal
   */
  createGoal(request: CreateGoalRequest): Goal {
    const db = getSQLite()
    const now = Date.now()
    const id = uuidv4()

    const stmt = db.prepare(`
      INSERT INTO goals (id, text, status, priority, created_at, updated_at)
      VALUES (?, ?, 'pending', ?, ?, ?)
    `)

    stmt.run(id, request.text, request.priority ?? 0, now, now)

    log.info('Goal created', { id, text: request.text.substring(0, 50) })

    return {
      id,
      text: request.text,
      status: 'pending',
      priority: request.priority ?? 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      autonomousEnabled: false,
      autonomousStartedAt: null,
      autonomousCompletedAt: null
    }
  }

  /**
   * Get all goals ordered by priority and creation date
   */
  getGoals(): Goal[] {
    const db = getSQLite()

    const stmt = db.prepare(`
      SELECT * FROM goals 
      ORDER BY 
        CASE status 
          WHEN 'in_progress' THEN 0 
          WHEN 'pending' THEN 1 
          WHEN 'completed' THEN 2 
        END,
        priority DESC,
        created_at DESC
    `)

    const rows = stmt.all() as Record<string, unknown>[]
    return rows.map(rowToGoal)
  }

  /**
   * Get a single goal by ID
   */
  getGoal(id: string): Goal | null {
    const db = getSQLite()

    const stmt = db.prepare('SELECT * FROM goals WHERE id = ?')
    const row = stmt.get(id) as Record<string, unknown> | undefined

    return row ? rowToGoal(row) : null
  }

  /**
   * Update a goal
   */
  updateGoal(id: string, updates: UpdateGoalRequest): Goal | null {
    const db = getSQLite()
    const now = Date.now()

    // Build dynamic update query
    const setClauses: string[] = ['updated_at = ?']
    const values: unknown[] = [now]

    if (updates.text !== undefined) {
      setClauses.push('text = ?')
      values.push(updates.text)
    }

    if (updates.status !== undefined) {
      setClauses.push('status = ?')
      values.push(updates.status)

      if (updates.status === 'completed') {
        setClauses.push('completed_at = ?')
        values.push(now)
      }
    }

    if (updates.priority !== undefined) {
      setClauses.push('priority = ?')
      values.push(updates.priority)
    }

    if (updates.autonomousEnabled !== undefined) {
      setClauses.push('autonomous_enabled = ?')
      values.push(updates.autonomousEnabled ? 1 : 0)
    }

    values.push(id)

    const stmt = db.prepare(`
      UPDATE goals SET ${setClauses.join(', ')} WHERE id = ?
    `)

    const result = stmt.run(...values)

    if (result.changes === 0) {
      return null
    }

    log.info('Goal updated', { id, updates })

    return this.getGoal(id)
  }

  /**
   * Delete a goal
   */
  deleteGoal(id: string): boolean {
    const db = getSQLite()

    const stmt = db.prepare('DELETE FROM goals WHERE id = ?')
    const result = stmt.run(id)

    if (result.changes > 0) {
      log.info('Goal deleted', { id })
      return true
    }

    return false
  }

  /**
   * Toggle goal completion status
   */
  toggleComplete(id: string): Goal | null {
    const goal = this.getGoal(id)
    if (!goal) return null

    const newStatus: GoalStatus = goal.status === 'completed' ? 'pending' : 'completed'

    return this.updateGoal(id, { status: newStatus })
  }

  /**
   * Enable autonomous processing for a goal
   */
  enableAutonomous(id: string): Goal | null {
    const db = getSQLite()
    const now = Date.now()

    const stmt = db.prepare(`
      UPDATE goals 
      SET autonomous_enabled = 1, 
          autonomous_started_at = ?,
          status = 'in_progress',
          updated_at = ?
      WHERE id = ?
    `)

    const result = stmt.run(now, now, id)

    if (result.changes === 0) {
      return null
    }

    log.info('Autonomous enabled for goal', { id })

    return this.getGoal(id)
  }

  /**
   * Disable autonomous processing for a goal
   */
  disableAutonomous(id: string): Goal | null {
    const db = getSQLite()
    const now = Date.now()

    const stmt = db.prepare(`
      UPDATE goals 
      SET autonomous_enabled = 0,
          updated_at = ?
      WHERE id = ?
    `)

    const result = stmt.run(now, id)

    if (result.changes === 0) {
      return null
    }

    log.info('Autonomous disabled for goal', { id })

    return this.getGoal(id)
  }

  /**
   * Add progress entry for a goal
   */
  addProgress(
    goalId: string,
    stepType: GoalProgress['stepType'],
    description: string
  ): GoalProgress {
    const db = getSQLite()
    const now = Date.now()
    const id = uuidv4()

    const stmt = db.prepare(`
      INSERT INTO goal_progress (id, goal_id, step_type, description, status, created_at)
      VALUES (?, ?, ?, ?, 'running', ?)
    `)

    stmt.run(id, goalId, stepType, description, now)

    return {
      id,
      goalId,
      stepType,
      description,
      status: 'running',
      output: null,
      createdAt: now,
      completedAt: null
    }
  }

  /**
   * Complete a progress entry
   */
  completeProgress(id: string, output?: string): GoalProgress | null {
    const db = getSQLite()
    const now = Date.now()

    const stmt = db.prepare(`
      UPDATE goal_progress 
      SET status = 'completed', output = ?, completed_at = ?
      WHERE id = ?
    `)

    const result = stmt.run(output ?? null, now, id)

    if (result.changes === 0) {
      return null
    }

    const selectStmt = db.prepare('SELECT * FROM goal_progress WHERE id = ?')
    const row = selectStmt.get(id) as Record<string, unknown> | undefined

    return row ? rowToProgress(row) : null
  }

  /**
   * Get progress entries for a goal
   */
  getProgress(goalId: string): GoalProgress[] {
    const db = getSQLite()

    const stmt = db.prepare(`
      SELECT * FROM goal_progress 
      WHERE goal_id = ? 
      ORDER BY created_at ASC
    `)

    const rows = stmt.all(goalId) as Record<string, unknown>[]
    return rows.map(rowToProgress)
  }

  /**
   * Get goals with autonomous processing enabled
   */
  getAutonomousGoals(): Goal[] {
    const db = getSQLite()

    const stmt = db.prepare(`
      SELECT * FROM goals 
      WHERE autonomous_enabled = 1 AND status != 'completed'
      ORDER BY priority DESC, created_at ASC
    `)

    const rows = stmt.all() as Record<string, unknown>[]
    return rows.map(rowToGoal)
  }
}

// Singleton instance
let goalsService: GoalsService | null = null

export function getGoalsService(): GoalsService {
  if (!goalsService) {
    goalsService = new GoalsService()
  }
  return goalsService
}

export * from './types'

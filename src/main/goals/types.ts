/**
 * Types for the Goals system
 */

export type GoalStatus = 'pending' | 'in_progress' | 'completed'

export interface Goal {
  id: string
  text: string
  status: GoalStatus
  priority: number
  createdAt: number
  updatedAt: number
  completedAt: number | null
  autonomousEnabled: boolean
  autonomousStartedAt: number | null
  autonomousCompletedAt: number | null
}

export interface GoalProgress {
  id: string
  goalId: string
  stepType: 'plan' | 'execute' | 'verify'
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output: string | null
  createdAt: number
  completedAt: number | null
}

export interface CreateGoalRequest {
  text: string
  priority?: number
}

export interface UpdateGoalRequest {
  text?: string
  status?: GoalStatus
  priority?: number
  autonomousEnabled?: boolean
}

// IPC Response types
export interface GoalsResponse {
  success: boolean
  goals?: Goal[]
  error?: string
}

export interface GoalResponse {
  success: boolean
  goal?: Goal
  error?: string
}

export interface GoalProgressResponse {
  success: boolean
  progress?: GoalProgress[]
  error?: string
}

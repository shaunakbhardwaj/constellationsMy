/**
 * Types for the Autonomous Agent System
 */

/**
 * Agent status indicating current operational state
 */
export type AgentStatus = 'idle' | 'planning' | 'executing' | 'paused' | 'error' | 'completed'

/**
 * Progress item representing a completed step
 */
export interface ProgressItem {
  id: string
  description: string
  completedAt: number
  type: 'plan' | 'execute' | 'verify'
}

/**
 * Plan item representing an upcoming task
 */
export interface PlanItem {
  id: string
  description: string
  type: 'search' | 'index' | 'analyze' | 'summarize' | 'create'
  order: number
}

/**
 * Complete agent state
 */
export interface AgentState {
  status: AgentStatus
  currentGoalId: string | null
  currentGoalText: string | null
  currentTask: string | null
  startedAt: number | null
  progress: ProgressItem[]
  upNext: PlanItem[]
  error: string | null
}

/**
 * Initial/default agent state
 */
export const DEFAULT_AGENT_STATE: AgentState = {
  status: 'idle',
  currentGoalId: null,
  currentGoalText: null,
  currentTask: null,
  startedAt: null,
  progress: [],
  upNext: [],
  error: null
}

/**
 * Agent state change event
 */
export interface AgentStateChangeEvent {
  previousState: AgentState
  newState: AgentState
  timestamp: number
}

/**
 * User guidance message
 */
export interface GuidanceMessage {
  id: string
  text: string
  timestamp: number
  processed: boolean
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean
  output: string
  data?: unknown
  error?: string
}

/**
 * Agent tool definition
 */
export interface AgentTool {
  name: string
  description: string
  parameters: ToolParameter[]
  execute: (params: Record<string, unknown>) => Promise<ToolResult>
}

/**
 * Tool parameter definition
 */
export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array'
  description: string
  required: boolean
}

/**
 * Execution plan for a goal
 */
export interface ExecutionPlan {
  goalId: string
  goalText: string
  steps: PlanStep[]
  createdAt: number
  revisedAt?: number
}

/**
 * Single step in an execution plan
 */
export interface PlanStep {
  id: string
  order: number
  tool: string
  params: Record<string, unknown>
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  result?: ToolResult
}

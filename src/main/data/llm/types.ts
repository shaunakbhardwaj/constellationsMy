/**
 * LLM Types for OpenRouter Integration
 */

/**
 * Chat message roles
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/**
 * Chat message
 */
export interface ChatMessage {
  role: MessageRole
  content: string
  name?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

/**
 * Tool call from assistant
 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

/**
 * Tool definition for function calling
 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, {
        type: string
        description: string
        enum?: string[]
      }>
      required?: string[]
    }
  }
}

/**
 * Chat completion request options
 */
export interface ChatCompletionOptions {
  model: string
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

/**
 * Chat completion response
 */
export interface ChatCompletionResponse {
  id: string
  model: string
  choices: ChatChoice[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Single choice in completion response
 */
export interface ChatChoice {
  index: number
  message: ChatMessage
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter'
}

/**
 * Streaming chunk
 */
export interface ChatStreamChunk {
  id: string
  model: string
  choices: {
    index: number
    delta: Partial<ChatMessage>
    finish_reason: string | null
  }[]
}

/**
 * OpenRouter API error
 */
export interface OpenRouterError {
  error: {
    code: string
    message: string
    metadata?: Record<string, unknown>
  }
}

/**
 * LLM Service
 * High-level wrapper for LLM interactions used by the agent
 */
import { createLogger } from '../../shared/logger'
import { getOpenRouterClient, OpenRouterClient } from './openrouter'
import type {
  ChatMessage,
  ToolDefinition,
  ToolCall
} from './types'

const log = createLogger('main/llm')

// Default model to use if none configured
const DEFAULT_MODEL = 'anthropic/claude-3-haiku'

/**
 * LLMService provides high-level LLM operations for the agent
 */
export class LLMService {
  private client: OpenRouterClient
  private model: string = DEFAULT_MODEL

  constructor() {
    this.client = getOpenRouterClient()
  }

  /**
   * Set the API key
   */
  setApiKey(apiKey: string): void {
    this.client.setApiKey(apiKey)
  }

  /**
   * Set the model to use
   */
  setModel(modelId: string): void {
    this.model = modelId
    log.info('Model set', { model: modelId })
  }

  /**
   * Get current model ID
   */
  getModel(): string {
    return this.model
  }

  /**
   * Check if LLM is ready (has API key)
   */
  isReady(): boolean {
    return this.client.hasApiKey()
  }

  /**
   * Simple chat - returns assistant message content
   */
  async chat(
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const response = await this.client.chat({
      model: this.model,
      messages,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content in response')
    }

    return content
  }

  /**
   * Chat with tool use - returns tool calls or content
   */
  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<{
    content: string | null
    toolCalls: ToolCall[]
  }> {
    const response = await this.client.chat({
      model: this.model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens
    })

    const choice = response.choices[0]
    if (!choice) {
      throw new Error('No choice in response')
    }

    return {
      content: choice.message.content ?? null,
      toolCalls: choice.message.tool_calls ?? []
    }
  }

  /**
   * Generate a structured JSON response
   */
  async generateJSON<T>(
    prompt: string,
    systemPrompt?: string
  ): Promise<T> {
    const messages: ChatMessage[] = []

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    messages.push({
      role: 'user',
      content: `${prompt}\n\nRespond with valid JSON only, no markdown or explanations.`
    })

    const response = await this.chat(messages, { temperature: 0.3 })

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response.trim()
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7)
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3)
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3)
    }
    jsonStr = jsonStr.trim()

    try {
      return JSON.parse(jsonStr) as T
    } catch (error) {
      log.error('Failed to parse JSON response', { response, error })
      throw new Error('Invalid JSON response from LLM')
    }
  }

  /**
   * Simple summarization helper
   */
  async summarize(
    content: string,
    style: 'brief' | 'detailed' | 'bullets' = 'brief'
  ): Promise<string> {
    const styleGuide = {
      brief: 'Provide a 2-3 sentence summary.',
      detailed: 'Provide a comprehensive summary with key details.',
      bullets: 'Provide a summary as bullet points.'
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant that creates clear, accurate summaries.'
      },
      {
        role: 'user',
        content: `${styleGuide[style]}\n\nContent to summarize:\n\n${content}`
      }
    ]

    return this.chat(messages, { temperature: 0.3 })
  }

  /**
   * Extract specific information from content
   */
  async extractInfo(
    content: string,
    focus: string
  ): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant that extracts specific information from content.'
      },
      {
        role: 'user',
        content: `Extract information about: ${focus}\n\nFrom this content:\n\n${content}`
      }
    ]

    return this.chat(messages, { temperature: 0.3 })
  }
}

// Singleton instance
let llmService: LLMService | null = null

export function getLLMService(): LLMService {
  if (!llmService) {
    llmService = new LLMService()
  }
  return llmService
}

export * from './types'
export * from './openrouter'

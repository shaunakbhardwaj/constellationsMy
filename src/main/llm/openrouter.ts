/**
 * OpenRouter API Client
 * Handles LLM chat completions and embeddings via OpenRouter
 */
import { createLogger } from '../../shared/logger'
import type {
  ChatCompletionOptions,
  ChatCompletionResponse,
  ChatStreamChunk,
  OpenRouterError
} from './types'

const log = createLogger('main/llm/openrouter')

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/**
 * OpenRouter API client for LLM interactions
 */
export class OpenRouterClient {
  private apiKey: string | null = null

  /**
   * Set the API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey
    log.info('API key set')
  }

  /**
   * Check if API key is configured
   */
  hasApiKey(): boolean {
    return Boolean(this.apiKey)
  }

  /**
   * Validate the API key by making a test request
   */
  async validateApiKey(): Promise<boolean> {
    if (!this.apiKey) return false

    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/auth/key`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Send a chat completion request
   */
  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured')
    }

    log.info('Chat completion request', {
      model: options.model,
      messageCount: options.messages.length,
      hasTools: Boolean(options.tools?.length)
    })

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://constellations.app',
        'X-Title': 'Constellations'
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        tool_choice: options.tool_choice,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 4096,
        stream: false
      })
    })

    if (!response.ok) {
      const error = await response.json() as OpenRouterError
      log.error('Chat completion failed', { error })
      throw new Error(error.error?.message ?? `OpenRouter API error: ${response.status}`)
    }

    const result = await response.json() as ChatCompletionResponse

    log.info('Chat completion success', {
      model: result.model,
      finishReason: result.choices[0]?.finish_reason,
      usage: result.usage
    })

    return result
  }

  /**
   * Send a streaming chat completion request
   */
  async *chatStream(options: ChatCompletionOptions): AsyncGenerator<ChatStreamChunk> {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured')
    }

    log.info('Chat stream request', {
      model: options.model,
      messageCount: options.messages.length
    })

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://constellations.app',
        'X-Title': 'Constellations'
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        tool_choice: options.tool_choice,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 4096,
        stream: true
      })
    })

    if (!response.ok) {
      const error = await response.json() as OpenRouterError
      throw new Error(error.error?.message ?? `OpenRouter API error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const json = JSON.parse(trimmed.slice(6)) as ChatStreamChunk
            yield json
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    log.info('Chat stream complete')
  }
}

// Singleton instance
let client: OpenRouterClient | null = null

export function getOpenRouterClient(): OpenRouterClient {
  if (!client) {
    client = new OpenRouterClient()
  }
  return client
}

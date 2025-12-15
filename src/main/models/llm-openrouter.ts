/**
 * OpenRouter LLM Model Catalog
 *
 * Edit this file to add/remove available LLM models for OpenRouter.
 * These models are shown in the Settings panel for selection.
 */

export interface LLMModelInfo {
  /** Model ID used in API calls (e.g., 'anthropic/claude-3-haiku') */
  id: string
  /** Display name */
  name: string
  /** Provider name (for display) */
  provider: string
  /** Context window size in tokens */
  contextLength: number
  /** Brief description */
  description: string
}

/**
 * Available OpenRouter LLM models
 * Add or remove models by editing this array
 */
export const OPENROUTER_MODELS: LLMModelInfo[] = [
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    contextLength: 200000,
    description: 'Fast and affordable'
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    contextLength: 200000,
    description: 'Best balance of speed and intelligence'
  },
  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    contextLength: 200000,
    description: 'Most capable Claude model'
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    contextLength: 128000,
    description: 'Latest GPT-4 model'
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    contextLength: 128000,
    description: 'Fast and capable'
  },
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    provider: 'Google',
    contextLength: 1000000,
    description: 'Long context window'
  },
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    contextLength: 128000,
    description: 'Powerful open source model'
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B',
    provider: 'Meta',
    contextLength: 128000,
    description: 'Fast open source model'
  }
]

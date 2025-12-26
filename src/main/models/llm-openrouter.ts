/**
 * OpenRouter LLM Model Catalog
 *
 * Free models for the ontology experiment.
 */

export interface LLMModelInfo {
  /** Model ID used in API calls */
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
 * Available OpenRouter LLM models (free tier)
 */
export const OPENROUTER_MODELS: LLMModelInfo[] = [
  {
    id: 'moonshotai/kimi-k2:free',
    name: 'Kimi K2',
    provider: 'Moonshot',
    contextLength: 128000,
    description: 'Powerful free model'
  },
  {
    id: 'deepseek/deepseek-r1-0528:free',
    name: 'DeepSeek R1',
    provider: 'DeepSeek',
    contextLength: 64000,
    description: 'Reasoning model'
  },
  {
    id: 'qwen/qwen3-coder:free',
    name: 'Qwen3 Coder',
    provider: 'Qwen',
    contextLength: 32000,
    description: 'Coding focused'
  },
  {
    id: 'openai/gpt-oss-120b:free',
    name: 'GPT OSS 120B',
    provider: 'OpenAI',
    contextLength: 128000,
    description: 'Large open source'
  },
  {
    id: 'mistralai/devstral-2512:free',
    name: 'Devstral',
    provider: 'Mistral',
    contextLength: 32000,
    description: 'Developer focused'
  }
]

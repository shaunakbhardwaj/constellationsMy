/**
 * Gemini LLM Model Catalog
 *
 * Edit this file to add/remove available Gemini models.
 * These models are shown in the Settings panel when Gemini is configured.
 */

import type { LLMModelInfo } from './llm-openrouter'

/**
 * Available Gemini LLM models
 * Add or remove models by editing this array
 */
export const GEMINI_MODELS: LLMModelInfo[] = [
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'Google',
    contextLength: 1000000,
    description: 'Fast multimodal model with 1M context'
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    contextLength: 2000000,
    description: 'Most capable Gemini with 2M context'
  },
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash (Experimental)',
    provider: 'Google',
    contextLength: 1000000,
    description: 'Latest experimental Gemini model'
  }
]

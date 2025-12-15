/**
 * Tests for LLMService and OpenRouterClient
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock fetch
global.fetch = vi.fn()

// Import after mocking
import { OpenRouterClient } from '../openrouter'
import { LLMService } from '../index'

describe('OpenRouterClient', () => {
  let client: OpenRouterClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new OpenRouterClient()
  })

  describe('setApiKey / hasApiKey', () => {
    it('should not have API key initially', () => {
      expect(client.hasApiKey()).toBe(false)
    })

    it('should have API key after setting', () => {
      client.setApiKey('test-key')
      expect(client.hasApiKey()).toBe(true)
    })
  })

  describe('validateApiKey', () => {
    it('should return false without API key', async () => {
      const result = await client.validateApiKey()
      expect(result).toBe(false)
    })

    it('should return true for valid key', async () => {
      client.setApiKey('valid-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({})
      } as Response)

      const result = await client.validateApiKey()
      expect(result).toBe(true)
    })

    it('should return false for invalid key', async () => {
      client.setApiKey('invalid-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Invalid' })
      } as Response)

      const result = await client.validateApiKey()
      expect(result).toBe(false)
    })
  })

  describe('chat', () => {
    it('should throw without API key', async () => {
      await expect(
        client.chat({ model: 'test', messages: [] })
      ).rejects.toThrow('API key not configured')
    })

    it('should make chat completion request', async () => {
      client.setApiKey('test-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test-id',
          model: 'test-model',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      } as Response)

      const result = await client.chat({
        model: 'anthropic/claude-3-haiku',
        messages: [{ role: 'user', content: 'Hi' }]
      })

      expect(result.choices[0].message.content).toBe('Hello!')
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key'
          })
        })
      )
    })

    it('should throw on API error', async () => {
      client.setApiKey('test-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'unauthorized', message: 'Invalid API key' }
        })
      } as Response)

      await expect(
        client.chat({ model: 'test', messages: [] })
      ).rejects.toThrow('Invalid API key')
    })
  })
})

describe('LLMService', () => {
  let service: LLMService
  
  beforeEach(() => {
    vi.clearAllMocks()
    // Create fresh instance (need to reset singleton in real implementation)
    service = new LLMService()
  })

  describe('setModel / getModel', () => {
    it('should have default model', () => {
      expect(service.getModel()).toBe('anthropic/claude-3-haiku')
    })

    it('should update model', () => {
      service.setModel('openai/gpt-4o')
      expect(service.getModel()).toBe('openai/gpt-4o')
    })
  })

  describe('isReady', () => {
    it('should not be ready without API key', () => {
      expect(service.isReady()).toBe(false)
    })

    it('should be ready after setting API key', () => {
      service.setApiKey('test-key')
      expect(service.isReady()).toBe(true)
    })
  })

  describe('generateJSON', () => {
    it('should parse JSON from response', async () => {
      service.setApiKey('test-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test',
          model: 'test',
          choices: [
            { index: 0, message: { role: 'assistant', content: '{"key": "value"}' }, finish_reason: 'stop' }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
        })
      } as Response)

      const result = await service.generateJSON<{ key: string }>('Generate JSON')

      expect(result).toEqual({ key: 'value' })
    })

    it('should handle JSON in markdown code blocks', async () => {
      service.setApiKey('test-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test',
          model: 'test',
          choices: [
            { index: 0, message: { role: 'assistant', content: '```json\n{"wrapped": true}\n```' }, finish_reason: 'stop' }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
        })
      } as Response)

      const result = await service.generateJSON<{ wrapped: boolean }>('Generate JSON')

      expect(result).toEqual({ wrapped: true })
    })

    it('should throw on invalid JSON', async () => {
      service.setApiKey('test-key')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'test',
          model: 'test',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'Not valid JSON' }, finish_reason: 'stop' }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
        })
      } as Response)

      await expect(
        service.generateJSON('Generate JSON')
      ).rejects.toThrow('Invalid JSON response')
    })
  })
})

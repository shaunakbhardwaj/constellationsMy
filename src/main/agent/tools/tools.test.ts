/**
 * Tests for Agent Tools
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock search function
vi.mock('../../search', () => ({
  searchBrain: vi.fn()
}))

// Mock LLM service
const mockLLMService = {
  isReady: vi.fn(),
  summarize: vi.fn(),
  extractInfo: vi.fn()
}

vi.mock('../../llm', () => ({
  getLLMService: () => mockLLMService
}))

// Import after mocking
import { searchBrain } from '../../search'
import { SearchTool, SummarizeTool, AnalyzeTool, ExtractTool, toolRegistry, getAvailableTools } from './index'

describe('SearchTool', () => {
  const tool = new SearchTool()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should have correct metadata', () => {
    expect(tool.name).toBe('search')
    expect(tool.description).toContain('search')
    expect(tool.parameters).toHaveLength(2)
  })

  it('should return error when query is missing', async () => {
    const result = await tool.execute({})

    expect(result.success).toBe(false)
    expect(result.error).toContain('required')
  })

  it('should perform search and return results', async () => {
    const mockResults = [
      { fileId: '1', fileName: 'test.txt', text: 'Hello world', score: 0.1, chunkIndex: 0 }
    ]
    vi.mocked(searchBrain).mockResolvedValue(mockResults)

    const result = await tool.execute({ query: 'hello', limit: 5 })

    expect(result.success).toBe(true)
    expect(result.output).toContain('Found 1 results')
    expect(result.data).toEqual({ results: mockResults })
  })

  it('should handle no results', async () => {
    vi.mocked(searchBrain).mockResolvedValue([])

    const result = await tool.execute({ query: 'nonexistent' })

    expect(result.success).toBe(true)
    expect(result.output).toContain('No results found')
  })

  it('should handle search errors', async () => {
    vi.mocked(searchBrain).mockRejectedValue(new Error('Search error'))

    const result = await tool.execute({ query: 'test' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Search error')
  })
})

describe('SummarizeTool', () => {
  const tool = new SummarizeTool()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should have correct metadata', () => {
    expect(tool.name).toBe('summarize')
    expect(tool.parameters.find(p => p.name === 'content')).toBeDefined()
    expect(tool.parameters.find(p => p.name === 'style')).toBeDefined()
  })

  it('should return error when content is missing', async () => {
    const result = await tool.execute({})

    expect(result.success).toBe(false)
    expect(result.error).toContain('required')
  })

  it('should use LLM when ready', async () => {
    mockLLMService.isReady.mockReturnValue(true)
    mockLLMService.summarize.mockResolvedValue('This is a summary.')

    const result = await tool.execute({ content: 'Long content to summarize...' })

    expect(result.success).toBe(true)
    expect(result.output).toBe('This is a summary.')
    expect(result.data).toEqual({ style: 'brief', llmUsed: true })
  })

  it('should fallback when LLM not ready', async () => {
    mockLLMService.isReady.mockReturnValue(false)

    const result = await tool.execute({ content: 'Some content here' })

    expect(result.success).toBe(true)
    expect(result.output).toContain('LLM not configured')
    expect(result.data?.llmUsed).toBe(false)
  })
})

describe('AnalyzeTool', () => {
  const tool = new AnalyzeTool()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should use LLM for analysis', async () => {
    mockLLMService.isReady.mockReturnValue(true)
    mockLLMService.extractInfo.mockResolvedValue('Key insight: Revenue increased by 20%')

    const result = await tool.execute({ content: 'Revenue data...', focus: 'trends' })

    expect(result.success).toBe(true)
    expect(result.output).toContain('Revenue increased')
    expect(mockLLMService.extractInfo).toHaveBeenCalledWith('Revenue data...', 'trends')
  })
})

describe('ExtractTool', () => {
  const tool = new ExtractTool()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should require both content and what parameters', async () => {
    const result1 = await tool.execute({ content: 'test' })
    expect(result1.success).toBe(false)

    const result2 = await tool.execute({ what: 'dates' })
    expect(result2.success).toBe(false)
  })

  it('should extract information with LLM', async () => {
    mockLLMService.isReady.mockReturnValue(true)
    mockLLMService.extractInfo.mockResolvedValue('Found dates: Jan 1, Feb 15')

    const result = await tool.execute({ content: 'Meeting on Jan 1, deadline Feb 15', what: 'dates' })

    expect(result.success).toBe(true)
    expect(result.output).toContain('Jan 1')
  })
})

describe('Tool Registry', () => {
  it('should include all tools', () => {
    expect(toolRegistry.search).toBeDefined()
    expect(toolRegistry.summarize).toBeDefined()
    expect(toolRegistry.analyze).toBeDefined()
    expect(toolRegistry.extract).toBeDefined()
  })

  it('should return available tool names', () => {
    const tools = getAvailableTools()

    expect(tools).toContain('search')
    expect(tools).toContain('summarize')
    expect(tools).toContain('analyze')
    expect(tools).toContain('extract')
  })
})

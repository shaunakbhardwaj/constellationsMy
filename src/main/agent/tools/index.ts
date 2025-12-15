/**
 * Agent Tools
 * Tools available to the autonomous agent for executing tasks
 */
import type { AgentTool, ToolParameter, ToolResult } from '../types'
import { searchBrain } from '../../search'
import { getLLMService } from '../../llm'
import { createLogger } from '../../../shared/logger'

const log = createLogger('main/agent/tools')

/**
 * Base class for agent tools with common functionality
 */
export abstract class BaseTool implements AgentTool {
  abstract name: string
  abstract description: string
  abstract parameters: ToolParameter[]

  abstract execute(params: Record<string, unknown>): Promise<ToolResult>

  protected success(output: string, data?: unknown): ToolResult {
    return { success: true, output, data }
  }

  protected failure(error: string): ToolResult {
    return { success: false, output: error, error }
  }
}

/**
 * SearchTool - Semantic search across the knowledge base
 */
export class SearchTool extends BaseTool {
  name = 'search'
  description = 'Search the knowledge base semantically to find relevant information'
  parameters: ToolParameter[] = [
    {
      name: 'query',
      type: 'string',
      description: 'The search query to find relevant content',
      required: true
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Maximum number of results to return',
      required: false
    }
  ]

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const query = params.query as string
    const limit = (params.limit as number) ?? 5

    if (!query || typeof query !== 'string') {
      return this.failure('Query parameter is required')
    }

    log.info('SearchTool executing', { query, limit })

    try {
      const results = await searchBrain(query, limit)

      if (results.length === 0) {
        return this.success(`No results found for "${query}"`, { results: [] })
      }

      const summary = results
        .map((r, i) => `${i + 1}. [${r.fileName}] ${r.text.substring(0, 200)}...`)
        .join('\n')

      return this.success(
        `Found ${results.length} results for "${query}":\n${summary}`,
        { results }
      )
    } catch (error) {
      log.error('SearchTool failed', { error, query })
      return this.failure(
        error instanceof Error ? error.message : 'Search failed'
      )
    }
  }
}

/**
 * SummarizeTool - LLM-powered summarization
 */
export class SummarizeTool extends BaseTool {
  name = 'summarize'
  description = 'Summarize content or search results using AI'
  parameters: ToolParameter[] = [
    {
      name: 'content',
      type: 'string',
      description: 'The content to summarize',
      required: true
    },
    {
      name: 'style',
      type: 'string',
      description: 'Summary style: brief, detailed, or bullets',
      required: false
    }
  ]

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const content = params.content as string
    const style = (params.style as 'brief' | 'detailed' | 'bullets') ?? 'brief'

    if (!content || typeof content !== 'string') {
      return this.failure('Content parameter is required')
    }

    log.info('SummarizeTool executing', { contentLength: content.length, style })

    try {
      const llm = getLLMService()

      if (!llm.isReady()) {
        // Fallback when LLM not available
        const wordCount = content.split(/\s+/).length
        return this.success(
          `Summary (LLM not configured): Content has ${wordCount} words, ${content.length} characters.`,
          { wordCount, style, llmUsed: false }
        )
      }

      const summary = await llm.summarize(content, style)
      return this.success(summary, { style, llmUsed: true })
    } catch (error) {
      log.error('SummarizeTool failed', { error })
      return this.failure(
        error instanceof Error ? error.message : 'Summarization failed'
      )
    }
  }
}

/**
 * AnalyzeTool - LLM-powered content analysis
 */
export class AnalyzeTool extends BaseTool {
  name = 'analyze'
  description = 'Analyze content to extract insights using AI'
  parameters: ToolParameter[] = [
    {
      name: 'content',
      type: 'string',
      description: 'The content to analyze',
      required: true
    },
    {
      name: 'focus',
      type: 'string',
      description: 'What to focus on in the analysis',
      required: false
    }
  ]

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const content = params.content as string
    const focus = (params.focus as string) ?? 'key insights'

    if (!content || typeof content !== 'string') {
      return this.failure('Content parameter is required')
    }

    log.info('AnalyzeTool executing', { contentLength: content.length, focus })

    try {
      const llm = getLLMService()

      if (!llm.isReady()) {
        // Fallback when LLM not available
        return this.success(
          `Analysis (LLM not configured): Focus area "${focus}" on ${content.length} characters of content.`,
          { focus, llmUsed: false }
        )
      }

      const analysis = await llm.extractInfo(content, focus)
      return this.success(analysis, { focus, llmUsed: true })
    } catch (error) {
      log.error('AnalyzeTool failed', { error })
      return this.failure(
        error instanceof Error ? error.message : 'Analysis failed'
      )
    }
  }
}

/**
 * ExtractTool - Extract specific information from content
 */
export class ExtractTool extends BaseTool {
  name = 'extract'
  description = 'Extract specific information from content'
  parameters: ToolParameter[] = [
    {
      name: 'content',
      type: 'string',
      description: 'The content to extract from',
      required: true
    },
    {
      name: 'what',
      type: 'string',
      description: 'What information to extract',
      required: true
    }
  ]

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const content = params.content as string
    const what = params.what as string

    if (!content || !what) {
      return this.failure('Both content and what parameters are required')
    }

    log.info('ExtractTool executing', { contentLength: content.length, what })

    try {
      const llm = getLLMService()

      if (!llm.isReady()) {
        return this.success(
          `Extraction (LLM not configured): Looking for "${what}" in content.`,
          { what, llmUsed: false }
        )
      }

      const extraction = await llm.extractInfo(content, what)
      return this.success(extraction, { what, llmUsed: true })
    } catch (error) {
      log.error('ExtractTool failed', { error })
      return this.failure(
        error instanceof Error ? error.message : 'Extraction failed'
      )
    }
  }
}

/**
 * Tool registry - all available tools
 */
export const toolRegistry: Record<string, AgentTool> = {
  search: new SearchTool(),
  summarize: new SummarizeTool(),
  analyze: new AnalyzeTool(),
  extract: new ExtractTool()
}

/**
 * Get a tool by name
 */
export function getTool(name: string): AgentTool | undefined {
  return toolRegistry[name]
}

/**
 * Get all available tool names
 */
export function getAvailableTools(): string[] {
  return Object.keys(toolRegistry)
}

/**
 * Get tool definitions for LLM function calling
 */
export function getToolDefinitions(): {
  name: string
  description: string
  parameters: ToolParameter[]
}[] {
  return Object.values(toolRegistry).map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }))
}

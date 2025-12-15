/**
 * Agent Tool Base Classes and Search Tool
 */
import type { AgentTool, ToolParameter, ToolResult } from '../types'
import { searchBrain } from '../../search'
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
 * SummarizeTool - Placeholder for LLM-powered summarization
 * Will be fully implemented in Phase 4 with LLM integration
 */
export class SummarizeTool extends BaseTool {
  name = 'summarize'
  description = 'Summarize content or search results (requires LLM in Phase 4)'
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
    const style = (params.style as string) ?? 'brief'

    if (!content || typeof content !== 'string') {
      return this.failure('Content parameter is required')
    }

    log.info('SummarizeTool executing (placeholder)', { contentLength: content.length, style })

    // Placeholder: In Phase 4, this will call the LLM
    // For now, return a mock summary
    const wordCount = content.split(/\s+/).length
    const summary = `[Placeholder Summary - LLM integration coming in Phase 4]\n` +
      `Content stats: ${wordCount} words, ${content.length} characters.\n` +
      `Style requested: ${style}`

    return this.success(summary, { wordCount, style })
  }
}

/**
 * AnalyzeTool - Placeholder for content analysis
 */
export class AnalyzeTool extends BaseTool {
  name = 'analyze'
  description = 'Analyze content to extract insights (requires LLM in Phase 4)'
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
    const focus = (params.focus as string) ?? 'general'

    if (!content || typeof content !== 'string') {
      return this.failure('Content parameter is required')
    }

    log.info('AnalyzeTool executing (placeholder)', { contentLength: content.length, focus })

    return this.success(
      `[Placeholder Analysis - LLM integration coming in Phase 4]\n` +
      `Focus: ${focus}\n` +
      `Content length: ${content.length} characters`,
      { focus }
    )
  }
}

/**
 * Tool registry - all available tools
 */
export const toolRegistry: Record<string, AgentTool> = {
  search: new SearchTool(),
  summarize: new SummarizeTool(),
  analyze: new AnalyzeTool()
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

/**
 * Agent Planning Prompts
 * Templates for LLM-powered planning and execution
 */

/**
 * System prompt for the agent planner
 */
export const PLANNER_SYSTEM_PROMPT = `You are an autonomous agent planning how to accomplish user goals.
You have access to a knowledge base of documents and can perform various operations on them.

Your task is to create a step-by-step execution plan to accomplish the user's goal.
Each step should use one of the available tools.

Be efficient - don't add unnecessary steps. Focus on what's needed to accomplish the goal.

Always output your plan as a valid JSON array.`

/**
 * Template for generating an execution plan
 */
export function getPlanningPrompt(
  goal: string,
  availableFiles: string[],
  tools: { name: string; description: string }[]
): string {
  const fileList = availableFiles.length > 0
    ? availableFiles.slice(0, 20).join('\n- ')
    : 'No files indexed yet'

  const toolList = tools
    .map(t => `- ${t.name}: ${t.description}`)
    .join('\n')

  return `Goal: ${goal}

Available files in knowledge base:
- ${fileList}
${availableFiles.length > 20 ? `\n... and ${availableFiles.length - 20} more files` : ''}

Available tools:
${toolList}

Create an execution plan to accomplish this goal.
Output a JSON array of steps, where each step has:
- id: unique identifier (step_1, step_2, etc.)
- tool: name of the tool to use
- params: object with tool parameters
- description: human-readable description of what this step does

Example format:
[
  {
    "id": "step_1",
    "tool": "search",
    "params": { "query": "revenue reports Q4", "limit": 5 },
    "description": "Search for Q4 revenue reports"
  },
  {
    "id": "step_2", 
    "tool": "summarize",
    "params": { "content": "search results", "style": "bullets" },
    "description": "Summarize findings as bullet points"
  }
]

Plan:`
}

/**
 * Template for revising a plan based on user guidance
 */
export function getRevisionPrompt(
  originalGoal: string,
  currentPlan: { id: string; tool: string; description: string }[],
  completedSteps: string[],
  userGuidance: string
): string {
  const planSummary = currentPlan
    .map(step => {
      const status = completedSteps.includes(step.id) ? '✓' : '○'
      return `${status} ${step.id}: ${step.description}`
    })
    .join('\n')

  return `Original goal: ${originalGoal}

Current plan:
${planSummary}

User guidance: "${userGuidance}"

Based on the user's guidance, revise the remaining steps of the plan.
Keep completed steps as-is. Output the revised plan as a JSON array.

If the guidance doesn't require changes, output the same plan.
If the user wants to skip something, remove those steps.
If the user wants to add something, insert new steps.

Revised plan:`
}

/**
 * Template for analyzing content
 */
export function getAnalysisPrompt(
  content: string,
  focus: string
): string {
  return `Analyze the following content with a focus on: ${focus}

Content:
${content}

Provide a clear, structured analysis. Include:
1. Key findings related to the focus area
2. Notable patterns or insights
3. Relevant quotes or data points

Analysis:`
}

/**
 * Template for synthesizing search results
 */
export function getSynthesisPrompt(
  goal: string,
  searchResults: { fileName: string; text: string }[]
): string {
  const results = searchResults
    .map((r, i) => `[${i + 1}] ${r.fileName}:\n${r.text.substring(0, 500)}...`)
    .join('\n\n')

  return `Goal: ${goal}

Search results from knowledge base:
${results}

Synthesize these search results to address the goal. Provide:
1. Key information found
2. Connections between different sources
3. Answer or progress toward the goal

Synthesis:`
}

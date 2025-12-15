/**
 * Guidance Prompts
 * Templates for processing user guidance during agent execution
 */

/**
 * System prompt for guidance processing
 */
export const GUIDANCE_SYSTEM_PROMPT = `You are processing user guidance for an autonomous agent.
The agent is in the middle of executing a plan to accomplish a goal.
Based on the user's guidance, decide what action to take.

Actions available:
- continue: No changes needed, continue with current plan
- modify_plan: Revise the remaining steps
- pause: Pause execution
- skip_step: Skip the current or a specific step
- add_step: Add a new step to the plan

Output your decision as JSON with:
- action: one of the above actions
- reason: brief explanation
- details: any additional information (e.g., new steps, step to skip)
`

/**
 * Template for processing guidance
 */
export function getGuidancePrompt(
  originalGoal: string,
  currentStep: string,
  remainingSteps: string[],
  guidance: string
): string {
  return `Original goal: ${originalGoal}

Currently executing: ${currentStep}

Remaining steps:
${remainingSteps.map((s, i) => `${i + 1}. ${s}`).join('\n') || 'No remaining steps'}

User guidance: "${guidance}"

Analyze the guidance and decide what action to take.
Output as JSON:
{
  "action": "continue" | "modify_plan" | "pause" | "skip_step" | "add_step",
  "reason": "explanation",
  "details": { ... optional details ... }
}

Decision:`
}

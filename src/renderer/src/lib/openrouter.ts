import type { AiProvider } from "@/lib/contracts";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const MINDMAP_SYSTEM_PROMPT = `You are a mindmap generator. Your task is to create comprehensive, well-structured mindmaps in markdown format.

Rules for generating mindmaps:
1. Use markdown headings to represent hierarchy:
   - # for the main topic (only one)
   - ## for main branches (4-6 items)
   - ### for sub-branches (2-4 per main branch)
   - #### for leaf nodes with specific details (2-4 per sub-branch)

2. Keep each node concise - maximum 8-10 words
3. Make content informative and specific, not generic
4. Cover the topic comprehensively
5. Do NOT include any text outside of the heading structure
6. Do NOT use bullet points or numbered lists
7. Do NOT add explanations or introductions

Example output format:
# Main Topic
## First Branch
### Sub-branch 1
#### Specific detail
#### Another detail
### Sub-branch 2
#### Detail here
## Second Branch
### Sub-branch
#### Leaf node`;

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
}

export interface GenerateMindmapResult {
  markdown: string;
  model: string;
}

export async function generateMindmapMarkdown(
  prompt: string,
  config: OpenRouterConfig,
): Promise<GenerateMindmapResult> {
  const model =
    config.model ||
    process.env.NEXT_PUBLIC_DEFAULT_MODEL ||
    "openai/gpt-oss-20b";

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "HTTP-Referer": "https://mindmap-app.vercel.app",
      "X-Title": "AI Mindmap Generator",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: MINDMAP_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Generate a comprehensive mindmap for: ${prompt}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error?.message || `OpenRouter API error: ${response.status}`,
    );
  }

  const data = await response.json();
  const markdown = data.choices?.[0]?.message?.content?.trim();

  if (!markdown) {
    throw new Error("No content generated");
  }

  return {
    markdown,
    model: data.model || model,
  };
}

// Available models for the dropdown
export const AVAILABLE_MODELS = [
  { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", provider: "OpenAI" },
  {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash (Free)",
    provider: "Google",
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
  },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
  { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5", provider: "Google" },
  {
    id: "meta-llama/llama-3.1-70b-instruct",
    name: "Llama 3.1 70B",
    provider: "Meta",
  },
];

export const OLLAMA_BASE_URL = "http://localhost:11434";

export const OLLAMA_MODELS = [
  { id: "gpt-oss:20b", name: "GPT-OSS 20B", provider: "Ollama" },
  { id: "llama3.2", name: "Llama 3.2", provider: "Ollama" },
  { id: "qwen3:8b", name: "Qwen3 8B", provider: "Ollama" },
  { id: "gemma3:4b", name: "Gemma 3 4B", provider: "Ollama" },
];

export const DEFAULT_PROVIDER: AiProvider = "ollama";
export const DEFAULT_OPENROUTER_MODEL =
  import.meta.env.VITE_DEFAULT_MODEL || AVAILABLE_MODELS[0].id;
export const DEFAULT_OLLAMA_MODEL =
  import.meta.env.VITE_DEFAULT_OLLAMA_MODEL || OLLAMA_MODELS[0].id;
export const DEFAULT_OLLAMA_BASE_URL =
  import.meta.env.VITE_OLLAMA_BASE_URL || OLLAMA_BASE_URL;

// Backward-compatible default for older imports.
export const DEFAULT_MODEL = DEFAULT_OPENROUTER_MODEL;

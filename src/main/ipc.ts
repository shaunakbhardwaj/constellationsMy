import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
// import { generateMindmapMarkdown } from '../renderer/src/lib/openrouter';

// We need to duplicate some types/logic here or import them if possible.
// Importing from renderer in main is risky if it relies on browser APIs.
// 'openrouter.ts' seems to use 'fetch' which is available in Node 18+.
// However, it uses process.env.NEXT_PUBLIC... which won't work.
// Better to re-implement specific logic or clean up 'openrouter.ts' to be universal.

// For now, I will reimplement the core fetch logic here to be safe and robust.

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

type ExpansionMode = 'standard' | 'deep_dive' | 'devils_advocate' | 'creative' | 'questions';

function loadPromptTemplate(mode: ExpansionMode): string {
    // In production, resources are in process.resourcesPath
    // In dev, they are in the project root/resources
    const isProd = process.env.NODE_ENV === 'production';
    const resourcesPath = isProd ? process.resourcesPath : path.join(__dirname, '../../resources');

    const promptPath = path.join(resourcesPath, 'prompts', `${mode}.md`);
    try {
        return fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
        console.warn(`Prompt template for mode "${mode}" not found at ${promptPath}, using standard`);
        const standardPath = path.join(resourcesPath, 'prompts', 'standard.md');
        try {
            return fs.readFileSync(standardPath, 'utf-8');
        } catch {
            return "You are a helpful AI assistant."; // Ultimate fallback
        }
    }
}

export function registerIpcHandlers() {
    ipcMain.handle('generate-mindmap', async (_, { prompt, apiKey, model }) => {
        try {
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://mindmap-app.vercel.app',
                    'X-Title': 'AI Mindmap Generator',
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: MINDMAP_SYSTEM_PROMPT },
                        { role: 'user', content: `Generate a comprehensive mindmap for: ${prompt}` },
                    ],
                    temperature: 0.7,
                    max_tokens: 2000,
                }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `OpenRouter API error: ${response.status}`);
            }

            const data = await response.json();
            const markdown = data.choices?.[0]?.message?.content?.trim();

            return { success: true, markdown, model: data.model || model };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('expand-node', async (_, params) => {
        try {
            const { topic, context, apiKey, model, mode = 'standard', rootTopic, siblings = [], customInstruction } = params;
            const systemPrompt = loadPromptTemplate(mode);

            let userPrompt = '';
            if (rootTopic) userPrompt += `The overall mindmap topic is: "${rootTopic}"\n\n`;
            if (context) userPrompt += `The path to this node is: ${context}\n\n`;
            if (siblings.length > 0) userPrompt += `Existing sibling nodes (DO NOT REPEAT these concepts): ${siblings.join(', ')}\n\n`;
            userPrompt += `Generate sub-topics to expand on: "${topic}"`;
            if (customInstruction) userPrompt += `\n\nAdditional instructions from user: ${customInstruction}`;

            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://mindmap-app.vercel.app',
                    'X-Title': 'AI Mindmap Generator',
                },
                body: JSON.stringify({
                    model: model || 'google/gemini-2.0-flash-exp:free',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: mode === 'creative' ? 0.9 : 0.7,
                    max_tokens: 1000,
                }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `OpenRouter API error: ${response.status}`);
            }

            const data = await response.json();
            const markdown = data.choices?.[0]?.message?.content?.trim();

            return { success: true, markdown, mode };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });
}

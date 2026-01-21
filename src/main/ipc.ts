import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { MemoryStore } from './memory/store';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

type DocumentMode = 'extract' | 'brainstorm' | 'flow';

function loadPrompt(type: 'document' | 'expand', mode?: DocumentMode): string {
    const isProd = process.env.NODE_ENV === 'production';
    const resourcesPath = isProd ? process.resourcesPath : path.join(__dirname, '../../resources');
    
    const promptPath = type === 'document' 
        ? path.join(resourcesPath, 'prompts', 'document', `${mode}.md`)
        : path.join(resourcesPath, 'prompts', 'expand.md');
    
    try {
        return fs.readFileSync(promptPath, 'utf-8');
    } catch {
        return 'You are a helpful AI that generates mindmap content using markdown headings only.';
    }
}

export function registerIpcHandlers() {
    const userDataMemoryDir = path.join(app.getPath('userData'), 'memory');
    const repoMemoryDir = path.join(process.cwd(), '.flows-memory');
    const configuredDir = process.env.FLOWS_MEMORY_DIR;

    const memoryDir = configuredDir
        ? path.isAbsolute(configuredDir) ? configuredDir : path.join(process.cwd(), configuredDir)
        : process.env.NODE_ENV === 'production'
            ? userDataMemoryDir
            : repoMemoryDir;

    console.log(`[memory] dir=${memoryDir}`);

    if (memoryDir === repoMemoryDir) {
        try {
            const from = userDataMemoryDir;
            const to = repoMemoryDir;
            const fromIndex = path.join(from, 'index.json');
            const toIndex = path.join(to, 'index.json');
            if (!fs.existsSync(toIndex) && fs.existsSync(fromIndex)) {
                fs.mkdirSync(to, { recursive: true });
                (fs as any).cpSync(from, to, { recursive: true });
                console.log('[memory] migrated from userData to repo');
            }
        } catch (err: any) {
            console.log('[memory] migration skipped', err?.message);
        }
    }

    const memoryStore = new MemoryStore(memoryDir);

    ipcMain.handle('generate-mindmap', async (_, { prompt, apiKey, model, documentMode = 'brainstorm' }) => {
        try {
            const systemPrompt = loadPrompt('document', documentMode);
            
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://flows-app.vercel.app',
                    'X-Title': 'Flows - AI Mindmapping',
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Generate a mindmap for: ${prompt}` },
                    ],
                    temperature: 0.7,
                    max_tokens: 2000,
                }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `API error: ${response.status}`);
            }

            const data = await response.json();
            return { success: true, markdown: data.choices?.[0]?.message?.content?.trim(), model: data.model || model };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('expand-node', async (_, params) => {
        try {
            const { topic, context, apiKey, model, rootTopic, siblings = [], customInstruction } = params;
            const systemPrompt = loadPrompt('expand');

            let userPrompt = '';
            if (rootTopic) userPrompt += `Mindmap topic: "${rootTopic}"\n`;
            if (context) userPrompt += `Path: ${context}\n`;
            if (siblings.length > 0) userPrompt += `Siblings (DO NOT REPEAT): ${siblings.join(', ')}\n`;
            userPrompt += `\nExpand: "${topic}"`;
            if (customInstruction) userPrompt += `\n\nUser guidance: ${customInstruction}`;

            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://flows-app.vercel.app',
                    'X-Title': 'Flows - AI Mindmapping',
                },
                body: JSON.stringify({
                    model: model || 'google/gemini-2.0-flash-exp:free',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: 0.7,
                    max_tokens: 1000,
                }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `API error: ${response.status}`);
            }

            const data = await response.json();
            return { success: true, markdown: data.choices?.[0]?.message?.content?.trim() };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('memory:list', async () => {
        try {
            console.log('[memory] list');
            const documents = await memoryStore.list();
            return { success: true, documents };
        } catch (error: any) {
            console.log('[memory] list error', error?.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('memory:get', async (_, { id }) => {
        try {
            console.log('[memory] get', id);
            const document = await memoryStore.get(id);
            return { success: true, document };
        } catch (error: any) {
            console.log('[memory] get error', id, error?.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('memory:create', async (_, params) => {
        try {
            console.log('[memory] create', params?.title);
            const document = await memoryStore.create(params);
            return { success: true, document };
        } catch (error: any) {
            console.log('[memory] create error', error?.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('memory:update', async (_, params) => {
        try {
            console.log('[memory] update', params?.id);
            const document = await memoryStore.update(params);
            return { success: true, document };
        } catch (error: any) {
            console.log('[memory] update error', params?.id, error?.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('memory:delete', async (_, { id }) => {
        try {
            console.log('[memory] delete', id);
            await memoryStore.delete(id);
            return { success: true };
        } catch (error: any) {
            console.log('[memory] delete error', id, error?.message);
            return { success: false, error: error.message };
        }
    });
}

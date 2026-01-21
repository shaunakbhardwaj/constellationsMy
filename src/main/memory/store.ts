import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export type MemoryDocumentMode = 'extract' | 'brainstorm' | 'flow';

export type MemoryDocumentMeta = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    model?: string;
    documentMode?: MemoryDocumentMode;
};

export type MemoryDocument = MemoryDocumentMeta & {
    prompt?: string;
    root: unknown;
};

type MemoryIndexV1 = {
    version: 1;
    documents: MemoryDocumentMeta[];
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const tmp = path.join(dir, `.${base}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8');
    await fs.rename(tmp, filePath);
}

function safeUuid(): string {
    try {
        return randomUUID();
    } catch {
        return `mem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}

export class MemoryStore {
    private readonly baseDir: string;
    private readonly docsDir: string;
    private readonly indexPath: string;
    private readyPromise: Promise<void> | null = null;
    private queue: Promise<void> = Promise.resolve();

    constructor(baseDir: string) {
        this.baseDir = baseDir;
        this.docsDir = path.join(baseDir, 'docs');
        this.indexPath = path.join(baseDir, 'index.json');
    }

    private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
        const next = this.queue.then(fn, fn);
        this.queue = next.then(
            () => undefined,
            () => undefined
        );
        return next;
    }

    private async ensureReady(): Promise<void> {
        if (!this.readyPromise) {
            this.readyPromise = (async () => {
                await fs.mkdir(this.docsDir, { recursive: true });
                try {
                    await fs.access(this.indexPath);
                } catch {
                    const empty: MemoryIndexV1 = { version: 1, documents: [] };
                    await writeJsonAtomic(this.indexPath, empty);
                }
            })();
        }
        await this.readyPromise;
    }

    private async readIndex(): Promise<MemoryIndexV1> {
        await this.ensureReady();
        try {
            const index = await readJsonFile<MemoryIndexV1>(this.indexPath);
            if (index?.version !== 1 || !Array.isArray(index.documents)) {
                throw new Error('Invalid memory index format');
            }
            return index;
        } catch (err) {
            const corruptPath = path.join(this.baseDir, `index.corrupt-${Date.now()}.json`);
            try {
                await fs.rename(this.indexPath, corruptPath);
            } catch {
                // ignore
            }
            const empty: MemoryIndexV1 = { version: 1, documents: [] };
            await writeJsonAtomic(this.indexPath, empty);
            return empty;
        }
    }

    private async writeIndex(index: MemoryIndexV1): Promise<void> {
        await this.ensureReady();
        await writeJsonAtomic(this.indexPath, index);
    }

    private docPath(id: string): string {
        return path.join(this.docsDir, `${id}.json`);
    }

    private async readDocument(id: string): Promise<MemoryDocument> {
        await this.ensureReady();
        const doc = await readJsonFile<MemoryDocument>(this.docPath(id));
        if (!doc || doc.id !== id) {
            throw new Error('Document not found');
        }
        return doc;
    }

    async list(): Promise<MemoryDocumentMeta[]> {
        return this.runExclusive(async () => {
            const index = await this.readIndex();
            return [...index.documents].sort((a, b) => b.updatedAt - a.updatedAt);
        });
    }

    async get(id: string): Promise<MemoryDocument> {
        return this.runExclusive(async () => {
            return this.readDocument(id);
        });
    }

    async create(input: {
        title?: string;
        prompt?: string;
        model?: string;
        documentMode?: MemoryDocumentMode;
        root: unknown;
    }): Promise<MemoryDocumentMeta> {
        return this.runExclusive(async () => {
            await this.ensureReady();

            const now = Date.now();
            const id = safeUuid();
            const title =
                input.title
                || (isObject(input.root) && typeof input.root.title === 'string' ? (input.root.title as string) : 'Untitled');

            const meta: MemoryDocumentMeta = {
                id,
                title,
                createdAt: now,
                updatedAt: now,
                model: input.model,
                documentMode: input.documentMode,
            };

            const doc: MemoryDocument = {
                ...meta,
                prompt: input.prompt,
                root: input.root,
            };

            const index = await this.readIndex();
            index.documents = [meta, ...index.documents.filter((d) => d.id !== id)];

            await writeJsonAtomic(this.docPath(id), doc);
            await this.writeIndex(index);

            return meta;
        });
    }

    async update(input: {
        id: string;
        title?: string;
        model?: string;
        documentMode?: MemoryDocumentMode;
        root?: unknown;
    }): Promise<MemoryDocumentMeta> {
        return this.runExclusive(async () => {
            const existing = await this.readDocument(input.id);
            const now = Date.now();

            const title =
                input.title
                || (input.root && isObject(input.root) && typeof input.root.title === 'string' ? (input.root.title as string) : existing.title);

            const updated: MemoryDocument = {
                ...existing,
                title,
                updatedAt: now,
                model: input.model ?? existing.model,
                documentMode: input.documentMode ?? existing.documentMode,
                root: input.root ?? existing.root,
            };

            const meta: MemoryDocumentMeta = {
                id: updated.id,
                title: updated.title,
                createdAt: updated.createdAt,
                updatedAt: updated.updatedAt,
                model: updated.model,
                documentMode: updated.documentMode,
            };

            const index = await this.readIndex();
            index.documents = [meta, ...index.documents.filter((d) => d.id !== meta.id)];

            await writeJsonAtomic(this.docPath(input.id), updated);
            await this.writeIndex(index);

            return meta;
        });
    }

    async delete(id: string): Promise<void> {
        return this.runExclusive(async () => {
            await this.ensureReady();
            const index = await this.readIndex();
            index.documents = index.documents.filter((d) => d.id !== id);
            await this.writeIndex(index);
            try {
                await fs.unlink(this.docPath(id));
            } catch {
                // ignore
            }
        });
    }
}

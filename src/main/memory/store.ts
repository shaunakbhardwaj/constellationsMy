import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import {
  ArtifactRecord,
  CompressionMapDocument,
  LegacyDocumentMode,
  SourceDocument,
  StoreMapMeta,
  ThinkingLens,
} from "../../shared/contracts";

type LegacyDocument = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
  documentMode?: LegacyDocumentMode;
  prompt?: string;
  root: unknown;
};

type StoreIndexV2 = {
  version: 2;
  sources: Array<
    Pick<
      SourceDocument,
      "id" | "title" | "inputKind" | "createdAt" | "updatedAt"
    >
  >;
  maps: StoreMapMeta[];
  artifacts: Array<
    Pick<ArtifactRecord, "id" | "kind" | "createdAt" | "updatedAt"> & {
      sourceDocumentId: string;
      compressionMapId: string;
    }
  >;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

async function writeJsonAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(
    dir,
    `.${base}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tmp, filePath);
}

function safeUuid(): string {
  try {
    return randomUUID();
  } catch {
    return `mem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function deriveRootTitle(root: unknown): string {
  if (isObject(root) && typeof root.title === "string" && root.title.trim()) {
    return root.title.trim();
  }
  return "Untitled";
}

export class MemoryStore {
  private readonly baseDir: string;
  private readonly sourcesDir: string;
  private readonly mapsDir: string;
  private readonly artifactsDir: string;
  private readonly legacyDocsDir: string;
  private readonly indexPath: string;
  private readyPromise: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.sourcesDir = path.join(baseDir, "sources");
    this.mapsDir = path.join(baseDir, "maps");
    this.artifactsDir = path.join(baseDir, "artifacts");
    this.legacyDocsDir = path.join(baseDir, "docs");
    this.indexPath = path.join(baseDir, "index.json");
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        await fs.mkdir(this.sourcesDir, { recursive: true });
        await fs.mkdir(this.mapsDir, { recursive: true });
        await fs.mkdir(this.artifactsDir, { recursive: true });
        await fs.mkdir(this.legacyDocsDir, { recursive: true });
        try {
          await fs.access(this.indexPath);
        } catch {
          const empty: StoreIndexV2 = {
            version: 2,
            sources: [],
            maps: [],
            artifacts: [],
          };
          await writeJsonAtomic(this.indexPath, empty);
        }
      })();
    }
    await this.readyPromise;
  }

  private async readIndex(): Promise<StoreIndexV2> {
    await this.ensureReady();

    try {
      const index = await readJsonFile<any>(this.indexPath);

      if (
        index?.version === 2 &&
        Array.isArray(index.sources) &&
        Array.isArray(index.maps) &&
        Array.isArray(index.artifacts)
      ) {
        return index as StoreIndexV2;
      }

      if (index?.version === 1 && Array.isArray(index.documents)) {
        const migrated = await this.migrateLegacyIndex(
          index.documents as LegacyDocument[],
        );
        await writeJsonAtomic(this.indexPath, migrated);
        return migrated;
      }

      throw new Error("Invalid memory index format");
    } catch {
      const corruptPath = path.join(
        this.baseDir,
        `index.corrupt-${Date.now()}.json`,
      );
      try {
        await fs.rename(this.indexPath, corruptPath);
      } catch {
        // ignore
      }
      const empty: StoreIndexV2 = {
        version: 2,
        sources: [],
        maps: [],
        artifacts: [],
      };
      await writeJsonAtomic(this.indexPath, empty);
      return empty;
    }
  }

  private async migrateLegacyIndex(
    docMetas: Array<{ id: string } & Record<string, unknown>>,
  ): Promise<StoreIndexV2> {
    const next: StoreIndexV2 = {
      version: 2,
      sources: [],
      maps: [],
      artifacts: [],
    };

    for (const meta of docMetas) {
      const id = String(meta.id);
      const docPath = path.join(this.legacyDocsDir, `${id}.json`);
      try {
        const legacy = await readJsonFile<LegacyDocument>(docPath);
        const now = legacy.updatedAt || Date.now();
        const sourceId = safeUuid();

        const sourceDoc: SourceDocument = {
          id: sourceId,
          title: legacy.title || deriveRootTitle(legacy.root),
          inputKind: legacy.prompt ? "prompt" : "text",
          prompt: legacy.prompt,
          sourceText: legacy.prompt,
          createdAt: legacy.createdAt || now,
          updatedAt: now,
        };
        await writeJsonAtomic(
          path.join(this.sourcesDir, `${sourceId}.json`),
          sourceDoc,
        );
        next.sources.push({
          id: sourceDoc.id,
          title: sourceDoc.title,
          inputKind: sourceDoc.inputKind,
          createdAt: sourceDoc.createdAt,
          updatedAt: sourceDoc.updatedAt,
        });

        const mapDoc: CompressionMapDocument = {
          id: legacy.id,
          kind: "compression_map",
          sourceDocumentId: sourceId,
          title: legacy.title || deriveRootTitle(legacy.root),
          root: legacy.root as any,
          createdAt: legacy.createdAt || now,
          updatedAt: now,
          provider: undefined,
          model: legacy.model,
          selectedNodeIds: [],
          selectedPathOrder: [],
          legacyDocumentMode: legacy.documentMode,
          lastUsedLens: "default",
        };
        await writeJsonAtomic(
          path.join(this.mapsDir, `${mapDoc.id}.json`),
          mapDoc,
        );
        next.maps.push(this.toMapMeta(mapDoc));
      } catch {
        // ignore legacy documents that cannot be migrated cleanly
      }
    }

    next.maps.sort((a, b) => b.updatedAt - a.updatedAt);
    next.sources.sort((a, b) => b.updatedAt - a.updatedAt);
    return next;
  }

  private async writeIndex(index: StoreIndexV2): Promise<void> {
    await this.ensureReady();
    await writeJsonAtomic(this.indexPath, index);
  }

  private sourcePath(id: string): string {
    return path.join(this.sourcesDir, `${id}.json`);
  }

  private mapPath(id: string): string {
    return path.join(this.mapsDir, `${id}.json`);
  }

  private artifactPath(id: string): string {
    return path.join(this.artifactsDir, `${id}.json`);
  }

  private toMapMeta(doc: CompressionMapDocument): StoreMapMeta {
    return {
      id: doc.id,
      kind: doc.kind,
      sourceDocumentId: doc.sourceDocumentId,
      title: doc.title,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      model: doc.model,
      provider: doc.provider,
      lastUsedLens: doc.lastUsedLens,
      selectedNodeIds: doc.selectedNodeIds ?? [],
      selectedPathOrder: doc.selectedPathOrder ?? [],
      legacyDocumentMode: doc.legacyDocumentMode,
    };
  }

  async listMaps(): Promise<StoreMapMeta[]> {
    return this.runExclusive(async () => {
      const index = await this.readIndex();
      return [...index.maps].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  async getMap(id: string): Promise<CompressionMapDocument> {
    return this.runExclusive(async () => {
      await this.ensureReady();
      return readJsonFile<CompressionMapDocument>(this.mapPath(id));
    });
  }

  async getSource(id: string): Promise<SourceDocument> {
    return this.runExclusive(async () => {
      await this.ensureReady();
      return readJsonFile<SourceDocument>(this.sourcePath(id));
    });
  }

  async createSource(
    input: Omit<SourceDocument, "id" | "createdAt" | "updatedAt">,
  ): Promise<SourceDocument> {
    return this.runExclusive(async () => {
      const index = await this.readIndex();
      const now = Date.now();
      const source: SourceDocument = {
        ...input,
        id: safeUuid(),
        createdAt: now,
        updatedAt: now,
      };
      await writeJsonAtomic(this.sourcePath(source.id), source);
      index.sources = [
        {
          id: source.id,
          title: source.title,
          inputKind: source.inputKind,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        },
        ...index.sources.filter((entry) => entry.id !== source.id),
      ];
      await this.writeIndex(index);
      return source;
    });
  }

  async createMap(input: {
    sourceDocumentId: string;
    title: string;
    root: unknown;
    model?: string;
    provider?: CompressionMapDocument["provider"];
    lastUsedLens?: ThinkingLens;
    selectedNodeIds?: string[];
    selectedPathOrder?: string[];
    legacyDocumentMode?: LegacyDocumentMode;
  }): Promise<StoreMapMeta> {
    return this.runExclusive(async () => {
      const index = await this.readIndex();
      const now = Date.now();
      const mapDoc: CompressionMapDocument = {
        id: safeUuid(),
        kind: "compression_map",
        sourceDocumentId: input.sourceDocumentId,
        title: input.title || deriveRootTitle(input.root),
        root: input.root as any,
        createdAt: now,
        updatedAt: now,
        provider: input.provider,
        model: input.model,
        lastUsedLens: input.lastUsedLens ?? "default",
        selectedNodeIds: input.selectedNodeIds ?? [],
        selectedPathOrder: input.selectedPathOrder ?? [],
        legacyDocumentMode: input.legacyDocumentMode,
      };
      await writeJsonAtomic(this.mapPath(mapDoc.id), mapDoc);
      const meta = this.toMapMeta(mapDoc);
      index.maps = [
        meta,
        ...index.maps.filter((entry) => entry.id !== meta.id),
      ];
      await this.writeIndex(index);
      return meta;
    });
  }

  async updateMap(input: {
    id: string;
    title?: string;
    root?: unknown;
    model?: string;
    provider?: CompressionMapDocument["provider"];
    lastUsedLens?: ThinkingLens;
    selectedNodeIds?: string[];
    selectedPathOrder?: string[];
  }): Promise<StoreMapMeta> {
    return this.runExclusive(async () => {
      const index = await this.readIndex();
      const existing = await readJsonFile<CompressionMapDocument<any>>(
        this.mapPath(input.id),
      );
      const updated: CompressionMapDocument<any> = {
        ...existing,
        title: input.title ?? existing.title,
        root: input.root ?? existing.root,
        provider: input.provider ?? existing.provider,
        model: input.model ?? existing.model,
        lastUsedLens: input.lastUsedLens ?? existing.lastUsedLens ?? "default",
        selectedNodeIds:
          input.selectedNodeIds ?? existing.selectedNodeIds ?? [],
        selectedPathOrder:
          input.selectedPathOrder ?? existing.selectedPathOrder ?? [],
        updatedAt: Date.now(),
      };
      await writeJsonAtomic(this.mapPath(updated.id), updated);
      const meta = this.toMapMeta(updated);
      index.maps = [
        meta,
        ...index.maps.filter((entry) => entry.id !== meta.id),
      ];
      await this.writeIndex(index);
      return meta;
    });
  }

  async listArtifactsByMap(
    compressionMapId: string,
  ): Promise<ArtifactRecord[]> {
    return this.runExclusive(async () => {
      const index = await this.readIndex();
      const related = index.artifacts.filter(
        (artifact) => artifact.compressionMapId === compressionMapId,
      );
      const loaded = await Promise.all(
        related.map((artifact) =>
          readJsonFile<ArtifactRecord>(this.artifactPath(artifact.id)).catch(
            () => null,
          ),
        ),
      );
      return loaded
        .filter((artifact): artifact is ArtifactRecord => Boolean(artifact))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  async createArtifact<T extends ArtifactRecord>(
    artifact: Omit<T, "id" | "createdAt" | "updatedAt">,
  ): Promise<T> {
    return this.runExclusive(async () => {
      const index = await this.readIndex();
      const now = Date.now();
      const fullArtifact = {
        ...artifact,
        id: safeUuid(),
        createdAt: now,
        updatedAt: now,
      } as T;
      await writeJsonAtomic(this.artifactPath(fullArtifact.id), fullArtifact);
      index.artifacts = [
        {
          id: fullArtifact.id,
          kind: fullArtifact.kind,
          createdAt: fullArtifact.createdAt,
          updatedAt: fullArtifact.updatedAt,
          sourceDocumentId: fullArtifact.sourceDocumentId,
          compressionMapId: fullArtifact.compressionMapId,
        },
        ...index.artifacts.filter((entry) => entry.id !== fullArtifact.id),
      ];
      await this.writeIndex(index);
      return fullArtifact;
    });
  }

  async updateArtifact<T extends ArtifactRecord>(artifact: T): Promise<T> {
    return this.runExclusive(async () => {
      const index = await this.readIndex();
      const updated = { ...artifact, updatedAt: Date.now() };
      await writeJsonAtomic(this.artifactPath(updated.id), updated);
      index.artifacts = [
        {
          id: updated.id,
          kind: updated.kind,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          sourceDocumentId: updated.sourceDocumentId,
          compressionMapId: updated.compressionMapId,
        },
        ...index.artifacts.filter((entry) => entry.id !== updated.id),
      ];
      await this.writeIndex(index);
      return updated as T;
    });
  }

  async deleteMap(id: string): Promise<void> {
    return this.runExclusive(async () => {
      const index = await this.readIndex();
      index.maps = index.maps.filter((entry) => entry.id !== id);
      index.artifacts = index.artifacts.filter(
        (entry) => entry.compressionMapId !== id,
      );
      await this.writeIndex(index);
      try {
        await fs.unlink(this.mapPath(id));
      } catch {
        // ignore
      }
      const relatedArtifacts = await fs
        .readdir(this.artifactsDir)
        .catch(() => []);
      await Promise.all(
        relatedArtifacts.map(async (fileName) => {
          const filePath = path.join(this.artifactsDir, fileName);
          try {
            const artifact = await readJsonFile<ArtifactRecord>(filePath);
            if (artifact.compressionMapId === id) {
              await fs.unlink(filePath);
            }
          } catch {
            // ignore
          }
        }),
      );
    });
  }
}

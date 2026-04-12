import { app, clipboard, ipcMain } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import {
  AiProvider,
  BranchBrief,
  BranchBriefArtifact,
  ExecutionHandoffArtifact,
  InputKind,
  ThinkingLens,
} from "../shared/contracts";
import { MemoryStore } from "./memory/store";
import { AppLogger } from "./logger";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
let processLoggingAttached = false;

function loadPrompt(name: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const resourcesPath = isProd
    ? process.resourcesPath
    : path.join(__dirname, "../../resources");
  const promptName = name.replace(/^prompts\//, "");
  const promptPath = path.join(resourcesPath, "prompts", promptName);

  try {
    return fs.readFileSync(promptPath, "utf-8");
  } catch {
    return "";
  }
}

function normalizeTitle(text: string, fallback: string): string {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.replace(/^#+\s*/, "").slice(0, 80) : fallback;
}

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function normalizeOllamaBaseUrl(baseUrl?: string): string {
  return (baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
}

function redactParams<T extends Record<string, unknown>>(params: T): T {
  return {
    ...params,
    apiKey: params.apiKey ? "[redacted]" : params.apiKey,
  };
}

async function callLLM(params: {
  logger: AppLogger;
  operation: string;
  provider?: AiProvider;
  apiKey?: string;
  model: string;
  ollamaBaseUrl?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: Record<string, unknown>;
}) {
  const requestId = `llm-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const provider = params.provider || "openrouter";
  const isOllama = provider === "ollama";
  const url = isOllama
    ? `${normalizeOllamaBaseUrl(params.ollamaBaseUrl)}/v1/chat/completions`
    : OPENROUTER_API_URL;

  if (!isOllama && !params.apiKey) {
    throw new Error("OpenRouter API key is required for OpenRouter models.");
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (!isOllama) {
      headers.Authorization = `Bearer ${params.apiKey}`;
      headers["HTTP-Referer"] = "https://flows-app.vercel.app";
      headers["X-Title"] = "Flows - Compression Routing";
    }

    const body: Record<string, unknown> = {
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      temperature: params.temperature ?? 0.4,
      max_tokens: params.maxTokens ?? 2200,
      stream: false,
    };
    if (params.responseFormat) {
      body.response_format = params.responseFormat;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message =
        error.error?.message || `${provider} API error: ${response.status}`;
      await params.logger.logLLMExchange({
        requestId,
        operation: params.operation,
        model: `${provider}:${params.model}`,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
        temperature: params.temperature ?? 0.4,
        maxTokens: params.maxTokens ?? 2200,
        responseFormat: params.responseFormat,
        status: "error",
        error: { status: response.status, message, body: error },
      });
      throw new Error(message);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      await params.logger.logLLMExchange({
        requestId,
        operation: params.operation,
        model: `${provider}:${data.model || params.model}`,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
        temperature: params.temperature ?? 0.4,
        maxTokens: params.maxTokens ?? 2200,
        responseFormat: params.responseFormat,
        status: "error",
        error: { message: "Model returned empty content", raw: data },
      });
      throw new Error("Model returned empty content");
    }

    await params.logger.logLLMExchange({
      requestId,
      operation: params.operation,
      model: `${provider}:${data.model || params.model}`,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      temperature: params.temperature ?? 0.4,
      maxTokens: params.maxTokens ?? 2200,
      responseFormat: params.responseFormat,
      status: "success",
      content,
    });

    return { content, model: data.model || params.model, provider, requestId };
  } catch (error) {
    if (
      error instanceof Error &&
      !/API error|Model returned empty content/.test(error.message)
    ) {
      await params.logger.logLLMExchange({
        requestId,
        operation: params.operation,
        model: `${provider}:${params.model}`,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
        temperature: params.temperature ?? 0.4,
        maxTokens: params.maxTokens ?? 2200,
        responseFormat: params.responseFormat,
        status: "error",
        error,
      });
    }
    throw error;
  }
}

function getExpandPromptForLens(lens: ThinkingLens): string {
  switch (lens) {
    case "deep_dive":
      return loadPrompt("prompts/expand-deep-dive.md");
    case "questions":
      return loadPrompt("prompts/expand-questions.md");
    case "devils_advocate":
      return loadPrompt("prompts/expand-devils-advocate.md");
    case "default":
    default:
      return loadPrompt("prompts/expand-default.md");
  }
}

function buildBranchContext(root: any, selectedPathOrder: string[]): string {
  const titles: string[] = [];

  const visit = (node: any): boolean => {
    if (!node) return false;
    if (selectedPathOrder.includes(node.id)) {
      titles.push(node.title);
    }
    for (const child of node.children || []) {
      visit(child);
    }
    return false;
  };

  visit(root);
  return titles.join(" -> ");
}

function collectNodeDetails(root: any, selectedNodeIds: string[]) {
  const details: Array<{
    id: string;
    title: string;
    description?: string;
    path: string;
    notes?: string;
  }> = [];
  const walk = (node: any, trail: string[]) => {
    const nextTrail = [...trail, node.title];
    if (selectedNodeIds.includes(node.id)) {
      details.push({
        id: node.id,
        title: node.title,
        description: node.description,
        path: nextTrail.join(" > "),
        notes: node.notes,
      });
    }
    for (const child of node.children || []) {
      walk(child, nextTrail);
    }
  };
  walk(root, []);
  return details;
}

function fallbackBranchBrief(
  title: string,
  nodeDetails: Array<{
    id: string;
    title: string;
    description?: string;
    path: string;
    notes?: string;
  }>,
): BranchBrief {
  return {
    title,
    objective: `Advance the "${title}" branch into concrete next steps.`,
    summary: nodeDetails
      .map((node) =>
        node.description ? `${node.path}: ${node.description}` : node.path,
      )
      .join(" | ")
      .slice(0, 400),
    keyPoints: nodeDetails.slice(0, 5).map((node) => node.title),
    risks: nodeDetails
      .filter((node) => /risk|block|issue|concern/i.test(node.title))
      .map((node) => node.title)
      .slice(0, 4),
    openQuestions: nodeDetails
      .filter((node) => /\?$/.test(node.title))
      .map((node) => node.title)
      .slice(0, 4),
    recommendedNextAction: `Review the branch and turn "${nodeDetails[0]?.title || title}" into an execution task.`,
    sourceNodeRefs: nodeDetails.map((node) => node.id),
  };
}

function formatCodexPayload(artifact: ExecutionHandoffArtifact): string {
  const payload = artifact.payload;
  const lines = [
    `# ${payload.title}`,
    "",
    `Objective: ${payload.objective}`,
    "",
    "Summary:",
    payload.summary,
    "",
    "Key Points:",
    ...payload.keyPoints.map((point) => `- ${point}`),
    "",
    "Risks:",
    ...(payload.risks.length
      ? payload.risks.map((risk) => `- ${risk}`)
      : ["- None captured"]),
    "",
    "Open Questions:",
    ...(payload.openQuestions.length
      ? payload.openQuestions.map((question) => `- ${question}`)
      : ["- None captured"]),
    "",
    `Recommended Next Action: ${payload.recommendedNextAction}`,
    "",
    "Source Context:",
    payload.sourceContext,
  ];

  return lines.join("\n");
}

function getCodexEnv(): NodeJS.ProcessEnv {
  const allowedKeys = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "CODEX_HOME",
    "XDG_CONFIG_HOME",
  ];
  return Object.fromEntries(
    allowedKeys
      .map((key) => [key, process.env[key]])
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
  );
}

function runCodexExec(params: {
  prompt: string;
  cwd: string;
  outputPath: string;
  timeoutMs?: number;
}): Promise<NonNullable<ExecutionHandoffArtifact["codexExec"]>> {
  const args = [
    "exec",
    "--full-auto",
    "--sandbox",
    "workspace-write",
    "-C",
    params.cwd,
    "--output-last-message",
    params.outputPath,
    "-",
  ];
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn("codex", args, {
      cwd: params.cwd,
      env: getCodexEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = windowlessSetTimeout(
      () => {
        if (settled) return;
        stderr += "\nCodex exec timed out.";
        child.kill("SIGTERM");
      },
      params.timeoutMs ?? 15 * 60 * 1000,
    );

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 30000) stdout = stdout.slice(-30000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 30000) stderr = stderr.slice(-30000);
    });
    child.on("error", (error) => {
      stderr += `\n${error.message}`;
    });
    child.on("close", (exitCode) => {
      settled = true;
      clearTimeout(timeout);
      let finalMessage = "";
      try {
        finalMessage = fs.readFileSync(params.outputPath, "utf-8");
      } catch {
        // The CLI may fail before writing the final message.
      }
      resolve({
        command: ["codex", ...args],
        cwd: params.cwd,
        exitCode,
        stdout: finalMessage || stdout,
        stderr,
        startedAt,
        finishedAt: Date.now(),
      });
    });
    child.stdin.end(params.prompt);
  });
}

function windowlessSetTimeout(
  callback: () => void,
  ms: number,
): NodeJS.Timeout {
  return setTimeout(callback, ms);
}

export function registerIpcHandlers() {
  const userDataMemoryDir = path.join(app.getPath("userData"), "memory");
  const repoMemoryDir = path.join(process.cwd(), ".flows-memory");
  const configuredDir = process.env.FLOWS_MEMORY_DIR;

  const memoryDir = configuredDir
    ? path.isAbsolute(configuredDir)
      ? configuredDir
      : path.join(process.cwd(), configuredDir)
    : process.env.NODE_ENV === "production"
      ? userDataMemoryDir
      : repoMemoryDir;

  console.log(`[memory] dir=${memoryDir}`);
  const memoryStore = new MemoryStore(memoryDir);
  const logger = new AppLogger(memoryDir);
  void logger.info("app", "Initialized memory store", { memoryDir });

  if (!processLoggingAttached) {
    processLoggingAttached = true;
    process.on("uncaughtException", (error) => {
      void logger.error("main", "Uncaught exception", { error });
    });
    process.on("unhandledRejection", (reason) => {
      void logger.error("main", "Unhandled rejection", { reason });
    });
  }

  ipcMain.handle("ai:list-ollama-models", async (_, params = {}) => {
    const { baseUrl } = params as { baseUrl?: string };
    const ollamaBaseUrl = normalizeOllamaBaseUrl(baseUrl);
    try {
      const response = await fetch(`${ollamaBaseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama model list error: ${response.status}`);
      }
      const data = await response.json();
      const models = Array.isArray(data.models)
        ? data.models
            .map((model: any) => ({
              id: String(model.name || "").trim(),
              name: String(model.name || "").trim(),
              size: model.size,
              modifiedAt: model.modified_at,
            }))
            .filter((model: { id: string }) => model.id)
        : [];
      return { success: true, models };
    } catch (error: any) {
      void logger.warn("ai", "Failed to list Ollama models", {
        error,
        baseUrl: ollamaBaseUrl,
      });
      return { success: false, error: error.message, models: [] };
    }
  });

  ipcMain.handle("source:ingest-text", async (_, params) => {
    try {
      const { inputKind, text, prompt, title } = params as {
        inputKind: InputKind;
        text?: string;
        prompt?: string;
        title?: string;
      };
      const source = await memoryStore.createSource({
        title: title || normalizeTitle(text || prompt || "", "Untitled source"),
        inputKind,
        sourceText: text,
        prompt,
      });
      void logger.info("source", "Ingested text source", {
        sourceId: source.id,
        inputKind: source.inputKind,
        title: source.title,
      });
      return { success: true, source };
    } catch (error: any) {
      void logger.error("source", "Failed to ingest text source", {
        error,
        params,
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("source:ingest-pdf", async (_, params) => {
    try {
      const { name, bytes } = params as {
        name: string;
        bytes: ArrayBuffer | Uint8Array;
      };
      const buffer = Buffer.isBuffer(bytes)
        ? bytes
        : Buffer.from(
            bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
          );
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      await parser.destroy().catch(() => undefined);
      const text = parsed.text?.replace(/\s+\n/g, "\n").trim();
      if (!text) {
        throw new Error("Could not extract readable text from that PDF.");
      }
      const source = await memoryStore.createSource({
        title: normalizeTitle(text, name.replace(/\.pdf$/i, "")),
        inputKind: "pdf",
        sourceText: text,
        sourceFile: {
          name,
          mimeType: "application/pdf",
          size: buffer.byteLength,
        },
      });
      void logger.info("source", "Ingested PDF source", {
        sourceId: source.id,
        title: source.title,
        bytes: buffer.byteLength,
      });
      return { success: true, source };
    } catch (error: any) {
      void logger.error("source", "Failed to ingest PDF source", {
        error,
        params,
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("map:generate-compression", async (_, params) => {
    try {
      const {
        sourceText,
        prompt,
        apiKey,
        model,
        provider = "openrouter",
        ollamaBaseUrl,
      } = params as {
        sourceText: string;
        prompt?: string;
        apiKey?: string;
        model: string;
        provider?: AiProvider;
        ollamaBaseUrl?: string;
      };
      const systemPrompt = loadPrompt("prompts/compression.md");
      const userPrompt = [
        prompt ? `Prompt:\n${prompt}\n` : "",
        "Source content:",
        sourceText,
      ]
        .filter(Boolean)
        .join("\n\n");
      const result = await callLLM({
        logger,
        operation: "compression_map",
        provider,
        apiKey,
        model,
        ollamaBaseUrl,
        systemPrompt,
        userPrompt,
        temperature: 0.35,
        maxTokens: 2600,
      });
      void logger.info("map", "Generated compression response", {
        sourceTextLength: sourceText.length,
        provider: result.provider,
        model: result.model,
      });
      return {
        success: true,
        markdown: result.content,
        provider: result.provider,
        model: result.model,
      };
    } catch (error: any) {
      void logger.error("map", "Failed to generate compression response", {
        error,
        params: redactParams(params),
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("map:expand-node-with-lens", async (_, params) => {
    try {
      const {
        topic,
        context,
        apiKey,
        model,
        provider = "openrouter",
        ollamaBaseUrl,
        rootTopic,
        siblings = [],
        customInstruction,
        lens = "default",
        sourceKind,
      } = params as any;
      const systemPrompt = getExpandPromptForLens(lens);
      let userPrompt = "";
      if (rootTopic) userPrompt += `Map topic: "${rootTopic}"\n`;
      if (sourceKind) userPrompt += `Source kind: ${sourceKind}\n`;
      if (context) userPrompt += `Path: ${context}\n`;
      if (siblings.length > 0)
        userPrompt += `Sibling topics (avoid duplicates): ${siblings.join(", ")}\n`;
      userPrompt += `\nExpand: "${topic}"`;
      if (customInstruction)
        userPrompt += `\n\nUser guidance: ${customInstruction}`;
      const result = await callLLM({
        logger,
        operation: `expand_${lens}`,
        provider,
        apiKey,
        model,
        ollamaBaseUrl,
        systemPrompt,
        userPrompt,
        temperature: 0.45,
        maxTokens: 1200,
      });
      void logger.info("map", "Expanded node with lens", {
        lens,
        topic,
        rootTopic,
      });
      return { success: true, markdown: result.content, lens };
    } catch (error: any) {
      void logger.error("map", "Failed to expand node with lens", {
        error,
        params: redactParams(params),
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("artifact:create-branch-brief", async (_, params) => {
    try {
      const {
        compressionMapId,
        selectedNodeIds,
        selectedPathOrder,
        apiKey,
        model,
        provider = "openrouter",
        ollamaBaseUrl,
      } = params as {
        compressionMapId: string;
        selectedNodeIds: string[];
        selectedPathOrder: string[];
        apiKey?: string;
        model?: string;
        provider?: AiProvider;
        ollamaBaseUrl?: string;
      };
      const map = await memoryStore.getMap(compressionMapId);
      const source = await memoryStore.getSource(map.sourceDocumentId);
      const nodeDetails = collectNodeDetails(map.root, selectedNodeIds);
      if (nodeDetails.length === 0) {
        throw new Error(
          "Select at least one branch before generating a brief.",
        );
      }

      let brief = fallbackBranchBrief(nodeDetails[0].title, nodeDetails);

      if (model && (provider === "ollama" || apiKey)) {
        try {
          const systemPrompt = loadPrompt("prompts/branch-brief.md");
          const userPrompt = JSON.stringify(
            {
              sourceTitle: source.title,
              sourceKind: source.inputKind,
              selectedPath: buildBranchContext(map.root, selectedPathOrder),
              nodes: nodeDetails,
            },
            null,
            2,
          );
          const result = await callLLM({
            logger,
            operation: "branch_brief",
            provider,
            apiKey,
            model,
            ollamaBaseUrl,
            systemPrompt,
            userPrompt,
            temperature: 0.25,
            maxTokens: 1400,
            responseFormat: { type: "json_object" },
          });
          const parsed = JSON.parse(stripCodeFences(result.content));
          brief = {
            ...brief,
            ...parsed,
            sourceNodeRefs:
              Array.isArray(parsed.sourceNodeRefs) &&
              parsed.sourceNodeRefs.length
                ? parsed.sourceNodeRefs
                : nodeDetails.map((node) => node.id),
          };
        } catch (error) {
          void logger.warn(
            "artifact",
            "Branch brief generation fell back to deterministic serializer",
            {
              error,
              compressionMapId,
            },
          );
        }
      }

      const artifact = await memoryStore.createArtifact<BranchBriefArtifact>({
        kind: "branch_brief",
        sourceDocumentId: map.sourceDocumentId,
        compressionMapId,
        selectedNodeIds,
        selectedPathOrder,
        brief,
      });
      void logger.info("artifact", "Created branch brief", {
        artifactId: artifact.id,
        compressionMapId,
        selectedNodeCount: selectedNodeIds.length,
      });
      return { success: true, artifact };
    } catch (error: any) {
      void logger.error("artifact", "Failed to create branch brief", {
        error,
        params: redactParams(params),
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("handoff:dispatch-to-codex", async (_, params) => {
    try {
      const {
        branchBriefId,
        compressionMapId,
        transport = "clipboard",
      } = params as {
        branchBriefId: string;
        compressionMapId: string;
        transport?: "clipboard" | "codex_exec";
      };
      const artifacts = await memoryStore.listArtifactsByMap(compressionMapId);
      const briefArtifact = artifacts.find(
        (artifact): artifact is BranchBriefArtifact =>
          artifact.id === branchBriefId && artifact.kind === "branch_brief",
      );
      if (!briefArtifact) {
        throw new Error("Branch brief not found.");
      }
      const map = await memoryStore.getMap(compressionMapId);
      const source = await memoryStore.getSource(map.sourceDocumentId);
      const payload = {
        title: briefArtifact.brief.title,
        objective: briefArtifact.brief.objective,
        summary: briefArtifact.brief.summary,
        keyPoints: briefArtifact.brief.keyPoints,
        risks: briefArtifact.brief.risks,
        openQuestions: briefArtifact.brief.openQuestions,
        recommendedNextAction: briefArtifact.brief.recommendedNextAction,
        sourceContext:
          source.sourceText?.slice(0, 4000) || source.prompt || source.title,
      };
      let handoff = await memoryStore.createArtifact<ExecutionHandoffArtifact>({
        kind: "execution_handoff",
        sourceDocumentId: map.sourceDocumentId,
        compressionMapId,
        branchBriefId,
        target: "codex",
        payload,
        status: "pending",
        transport,
      });

      const formattedPayload = formatCodexPayload(handoff);

      if (transport === "codex_exec") {
        handoff = await memoryStore.updateArtifact<ExecutionHandoffArtifact>({
          ...handoff,
          status: "running",
        });

        const codexOutputDir = path.join(memoryDir, "codex-runs");
        fs.mkdirSync(codexOutputDir, { recursive: true });
        const outputPath = path.join(codexOutputDir, `${handoff.id}.md`);
        const codexExec = await runCodexExec({
          prompt: formattedPayload,
          cwd: process.cwd(),
          outputPath,
        });
        handoff = await memoryStore.updateArtifact<ExecutionHandoffArtifact>({
          ...handoff,
          status: codexExec.exitCode === 0 ? "completed" : "failed",
          codexExec,
        });
        void logger.info("handoff", "Ran Codex exec for branch brief", {
          handoffId: handoff.id,
          branchBriefId,
          compressionMapId,
          exitCode: codexExec.exitCode,
        });
        return {
          success: true,
          artifact: handoff,
          ranCodexExec: true,
          error:
            codexExec.exitCode === 0
              ? undefined
              : codexExec.stderr || "Codex exec failed",
        };
      }

      clipboard.writeText(formattedPayload);
      handoff = await memoryStore.updateArtifact<ExecutionHandoffArtifact>({
        ...handoff,
        status: "sent",
      });
      void logger.info(
        "handoff",
        "Dispatched branch brief to Codex clipboard",
        {
          handoffId: handoff.id,
          branchBriefId,
          compressionMapId,
        },
      );
      return { success: true, artifact: handoff, copied: true };
    } catch (error: any) {
      void logger.error("handoff", "Failed to dispatch branch brief to Codex", {
        error,
        params,
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("log:event", async (_, params) => {
    try {
      const {
        level = "info",
        scope = "renderer",
        message,
        meta,
      } = params as {
        level?: "info" | "warn" | "error";
        scope?: string;
        message: string;
        meta?: Record<string, unknown>;
      };
      if (level === "error") {
        await logger.error(scope, message, meta);
      } else if (level === "warn") {
        await logger.warn(scope, message, meta);
      } else {
        await logger.info(scope, message, meta);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("log:recent", async (_, { limit = 200 } = {}) => {
    try {
      const entries = await logger.readRecent(limit);
      return { success: true, entries, path: logger.getLogPath() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("log:recent-llm", async (_, { limit = 100 } = {}) => {
    try {
      const entries = await logger.readRecentLLM(limit);
      return { success: true, entries, path: logger.getLLMLogPath() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    "artifact:list-by-document",
    async (_, { compressionMapId }) => {
      try {
        const artifacts =
          await memoryStore.listArtifactsByMap(compressionMapId);
        return { success: true, artifacts };
      } catch (error: any) {
        void logger.error("artifact", "Failed to list artifacts by document", {
          error,
          compressionMapId,
        });
        return { success: false, error: error.message };
      }
    },
  );

  ipcMain.handle("memory:list", async () => {
    try {
      const documents = await memoryStore.listMaps();
      return { success: true, documents };
    } catch (error: any) {
      void logger.error("memory", "Failed to list maps", { error });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("memory:get", async (_, { id }) => {
    try {
      const document = await memoryStore.getMap(id);
      const source = await memoryStore.getSource(document.sourceDocumentId);
      return { success: true, document, source };
    } catch (error: any) {
      void logger.error("memory", "Failed to get map", { error, id });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("memory:create", async (_, params) => {
    try {
      const document = await memoryStore.createMap(params);
      void logger.info("memory", "Created compression map", {
        id: document.id,
        title: document.title,
      });
      return { success: true, document };
    } catch (error: any) {
      void logger.error("memory", "Failed to create map", { error, params });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("memory:update", async (_, params) => {
    try {
      const document = await memoryStore.updateMap(params);
      void logger.info("memory", "Updated compression map", {
        id: document.id,
        title: document.title,
      });
      return { success: true, document };
    } catch (error: any) {
      void logger.error("memory", "Failed to update map", { error, params });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("memory:delete", async (_, { id }) => {
    try {
      await memoryStore.deleteMap(id);
      void logger.info("memory", "Deleted compression map", { id });
      return { success: true };
    } catch (error: any) {
      void logger.error("memory", "Failed to delete map", { error, id });
      return { success: false, error: error.message };
    }
  });
}

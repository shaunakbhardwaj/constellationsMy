import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from "react";
import { parseMarkdownToTree, MindmapNode } from "@/lib/parseMarkdown";
import { useMindmapState } from "@/lib/useMindmapState";
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_PROVIDER,
} from "@/lib/openrouter";
import CanvasOverlay from "@/components/layout/CanvasOverlay";
import NodeContextMenu from "@/components/mindmap/NodeContextMenu";
import NotesModal from "@/components/mindmap/NotesModal";
import DeleteConfirmDialog from "@/components/mindmap/DeleteConfirmDialog";
import SettingsPanel from "@/components/settings/SettingsPanel";
import DiagnosticsPanel from "@/components/settings/DiagnosticsPanel";
import AIExpandBar from "@/components/mindmap/AIExpandBar";
import type {
  BranchBriefArtifact,
  AiProvider,
  ExecutionHandoffArtifact,
  InputKind,
  SourceDocument,
  StoreMapMeta,
  ThinkingLens,
} from "@/lib/contracts";
import { logEvent } from "@/lib/logger";
import styles from "./page.module.css";

const MindmapCanvas = lazy(() => import("@/components/mindmap/MindmapCanvas"));

const STORAGE_KEYS = {
  API_KEY: "mindmap_openrouter_api_key",
  MODEL: "mindmap_selected_model",
  PROVIDER: "mindmap_ai_provider",
  OPENROUTER_MODEL: "mindmap_openrouter_model",
  OLLAMA_MODEL: "mindmap_ollama_model",
  OLLAMA_BASE_URL: "mindmap_ollama_base_url",
};

type InputView = "ask" | "paste" | "pdf";
type ArtifactRecord = BranchBriefArtifact | ExecutionHandoffArtifact;
type LogEntry = {
  ts: string;
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
};
type LLMEntry = {
  ts: string;
  kind: "llm";
  requestId: string;
  operation: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: Record<string, unknown>;
  status: "success" | "error";
  content?: string;
  error?: Record<string, unknown>;
};

export default function App() {
  const [inputView, setInputView] = useState<InputView>("ask");
  const [prompt, setPrompt] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [provider, setProvider] = useState<AiProvider>(DEFAULT_PROVIDER);
  const [apiKey, setApiKey] = useState("");
  const [openRouterModel, setOpenRouterModel] = useState(
    DEFAULT_OPENROUTER_MODEL,
  );
  const [ollamaModel, setOllamaModel] = useState(DEFAULT_OLLAMA_MODEL);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(DEFAULT_OLLAMA_BASE_URL);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [memoryDocuments, setMemoryDocuments] = useState<StoreMapMeta[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [currentMapId, setCurrentMapId] = useState<string | null>(null);
  const [currentSource, setCurrentSource] = useState<SourceDocument | null>(
    null,
  );
  const [currentArtifacts, setCurrentArtifacts] = useState<ArtifactRecord[]>(
    [],
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isDiagnosticsLoading, setIsDiagnosticsLoading] = useState(false);
  const [diagnosticEntries, setDiagnosticEntries] = useState<LogEntry[]>([]);
  const [logPath, setLogPath] = useState("");
  const [llmEntries, setLLMEntries] = useState<LLMEntry[]>([]);
  const [llmLogPath, setLLMLogPath] = useState("");
  const [activeTab, setActiveTab] = useState<"generate" | "history">(
    "generate",
  );
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLens, setSelectedLens] = useState<ThinkingLens>("default");
  const [viewKey, setViewKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [historyError, setHistoryError] = useState<string | null>(null);

  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveSeqRef = useRef(0);
  const saveResetTimerRef = useRef<number | null>(null);

  const mindmapState = useMindmapState(null);
  const {
    root,
    selectedNodeId,
    selectedNodeIds,
    selectedPathOrder,
    editingNodeId,
    expandingNodeId,
    focusedNodeId,
    setData,
    setSelectedNodeId,
    setSelectedNodeIds,
    setSelectedPathOrder,
    setEditingNodeId,
    setExpandingNodeId,
    setFocusedNodeId,
    addChild,
    updateNode,
    deleteNode,
    setNodeColor,
    resetNodeStyle,
    setNodeNotes,
    expandNode,
    toggleCollapse,
    collapseSiblings,
    getNode,
    getNodePath,
    getDescendantCount,
    isNodeInFocus,
    togglePathSelection,
    clearPathSelection,
    movePathNode,
  } = mindmapState;

  const [menuState, setMenuState] = useState<{
    node: MindmapNode;
    position: { x: number; y: number };
  } | null>(null);
  const [notesModalNode, setNotesModalNode] = useState<MindmapNode | null>(
    null,
  );
  const [deleteConfirmNode, setDeleteConfirmNode] =
    useState<MindmapNode | null>(null);
  const [aiExpandModalState, setAiExpandModalState] = useState<{
    node: MindmapNode;
    position: { x: number; y: number };
  } | null>(null);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);

  const activeModel = provider === "ollama" ? ollamaModel : openRouterModel;

  useEffect(() => {
    const storedApiKey =
      localStorage.getItem(STORAGE_KEYS.API_KEY) ||
      import.meta.env.VITE_OPENROUTER_API_KEY ||
      "";
    const storedProvider =
      (localStorage.getItem(STORAGE_KEYS.PROVIDER) as AiProvider | null) ||
      DEFAULT_PROVIDER;
    const legacyModel =
      localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_OPENROUTER_MODEL;
    const storedOpenRouterModel =
      localStorage.getItem(STORAGE_KEYS.OPENROUTER_MODEL) || legacyModel;
    const storedOllamaModel =
      localStorage.getItem(STORAGE_KEYS.OLLAMA_MODEL) || DEFAULT_OLLAMA_MODEL;
    const storedOllamaBaseUrl =
      localStorage.getItem(STORAGE_KEYS.OLLAMA_BASE_URL) ||
      DEFAULT_OLLAMA_BASE_URL;
    setApiKey(storedApiKey);
    setProvider(storedProvider === "openrouter" ? "openrouter" : "ollama");
    setOpenRouterModel(storedOpenRouterModel);
    setOllamaModel(storedOllamaModel);
    setOllamaBaseUrl(storedOllamaBaseUrl);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    }
  }, [apiKey, isHydrated]);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
    }
  }, [provider, isHydrated]);

  useEffect(() => {
    if (isHydrated && openRouterModel) {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_MODEL, openRouterModel);
    }
  }, [openRouterModel, isHydrated]);

  useEffect(() => {
    if (isHydrated && ollamaModel) {
      localStorage.setItem(STORAGE_KEYS.OLLAMA_MODEL, ollamaModel);
    }
  }, [ollamaModel, isHydrated]);

  useEffect(() => {
    if (isHydrated && ollamaBaseUrl) {
      localStorage.setItem(STORAGE_KEYS.OLLAMA_BASE_URL, ollamaBaseUrl);
    }
  }, [ollamaBaseUrl, isHydrated]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 2400);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const refreshDiagnostics = useCallback(async () => {
    setIsDiagnosticsLoading(true);
    try {
      const [result, llmResult] = await Promise.all([
        window.api.log.recent(150),
        window.api.log.recentLLM(60),
      ]);
      if (result?.success) {
        setDiagnosticEntries(
          Array.isArray(result.entries) ? result.entries : [],
        );
        setLogPath(result.path || "");
      }
      if (llmResult?.success) {
        setLLMEntries(
          Array.isArray(llmResult.entries) ? llmResult.entries : [],
        );
        setLLMLogPath(llmResult.path || "");
      }
    } finally {
      setIsDiagnosticsLoading(false);
    }
  }, []);

  const refreshOllamaModels = useCallback(async () => {
    setOllamaStatus("loading");
    setOllamaError(null);
    try {
      const result = await window.api.ai.listOllamaModels({
        baseUrl: ollamaBaseUrl,
      });
      if (!result?.success) {
        throw new Error(result?.error || "Ollama is not reachable.");
      }
      const modelIds = Array.isArray(result.models)
        ? result.models
            .map(
              (entry: { id?: string; name?: string }) => entry.id || entry.name,
            )
            .filter(Boolean)
        : [];
      setOllamaModels(modelIds);
      if (modelIds.length > 0 && !modelIds.includes(ollamaModel)) {
        setOllamaModel(modelIds[0]);
      }
      setOllamaStatus("ok");
    } catch (err) {
      setOllamaStatus("error");
      setOllamaError(
        err instanceof Error ? err.message : "Ollama is not reachable.",
      );
    }
  }, [ollamaBaseUrl, ollamaModel]);

  useEffect(() => {
    if (isSettingsOpen && provider === "ollama") {
      void refreshOllamaModels();
    }
  }, [isSettingsOpen, provider, refreshOllamaModels]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      void logEvent({
        level: "error",
        scope: "renderer.window",
        message: event.message || "Unhandled renderer error",
        meta: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error instanceof Error ? event.error.stack : undefined,
        },
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      void logEvent({
        level: "error",
        scope: "renderer.window",
        message: "Unhandled promise rejection",
        meta: {
          reason:
            event.reason instanceof Error
              ? { message: event.reason.message, stack: event.reason.stack }
              : String(event.reason),
        },
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  const upsertMemoryDocument = useCallback((doc: StoreMapMeta) => {
    setMemoryDocuments((prev) => {
      const next = [doc, ...prev.filter((entry) => entry.id !== doc.id)];
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      return next;
    });
  }, []);

  const refreshHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      const result = await window.api.memory.list();
      if (!result?.success) {
        throw new Error(result?.error || "Failed to load map history");
      }
      setMemoryDocuments(
        Array.isArray(result.documents) ? result.documents : [],
      );
    } catch (err) {
      setHistoryError(
        err instanceof Error ? err.message : "Failed to load history",
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  const refreshArtifacts = useCallback(async (mapId: string) => {
    const result = await window.api.artifact.listByDocument(mapId);
    if (result?.success) {
      setCurrentArtifacts(
        Array.isArray(result.artifacts) ? result.artifacts : [],
      );
    }
  }, []);

  const handleOpenMemoryDocument = useCallback(
    async (id: string) => {
      try {
        setHistoryError(null);
        const result = await window.api.memory.get(id);
        if (!result?.success) {
          throw new Error(result?.error || "Failed to open document");
        }
        const doc = result.document as {
          root: MindmapNode;
          provider?: AiProvider;
          model?: string;
          selectedNodeIds?: string[];
          selectedPathOrder?: string[];
        };
        if (!doc?.root) {
          throw new Error("Invalid document data");
        }
        setCurrentMapId(id);
        setCurrentSource(result.source as SourceDocument);
        setSaveStatus("idle");
        if (doc.provider === "ollama" || doc.provider === "openrouter") {
          setProvider(doc.provider);
          if (typeof doc.model === "string" && doc.model) {
            if (doc.provider === "ollama") {
              setOllamaModel(doc.model);
            } else {
              setOpenRouterModel(doc.model);
            }
          }
        }
        setData(doc.root);
        setSelectedNodeIds(doc.selectedNodeIds || []);
        setSelectedPathOrder(doc.selectedPathOrder || []);
        setSelectionMode((doc.selectedNodeIds || []).length > 0);
        setViewKey((prev) => prev + 1);
        setIsCanvasOpen(true);
        setActiveTab("generate");
        await refreshArtifacts(id);
      } catch (err) {
        void logEvent({
          level: "error",
          scope: "renderer.history",
          message: "Failed to open compression map",
          meta: { id, error: err instanceof Error ? err.message : String(err) },
        });
        setHistoryError(
          err instanceof Error ? err.message : "Failed to open document",
        );
      }
    },
    [refreshArtifacts, setData, setSelectedNodeIds, setSelectedPathOrder],
  );

  const handleDeleteMemoryDocument = useCallback(
    async (id: string) => {
      try {
        setHistoryError(null);
        const result = await window.api.memory.delete(id);
        if (!result?.success) {
          throw new Error(result?.error || "Failed to delete document");
        }
        setMemoryDocuments((prev) => prev.filter((entry) => entry.id !== id));
        if (currentMapId === id) {
          setCurrentMapId(null);
          setCurrentSource(null);
          setCurrentArtifacts([]);
        }
      } catch (err) {
        setHistoryError(
          err instanceof Error ? err.message : "Failed to delete document",
        );
      }
    },
    [currentMapId],
  );

  useEffect(() => {
    if (activeTab === "history") {
      refreshHistory();
    }
  }, [activeTab, refreshHistory]);

  const createSourceAndMap = useCallback(
    async (params: {
      inputKind: InputKind;
      text?: string;
      prompt?: string;
      file?: File | null;
    }) => {
      if (provider === "openrouter" && !apiKey.trim()) {
        setError("Please add your OpenRouter API key in Settings.");
        setIsSettingsOpen(true);
        return;
      }

      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        let sourceResult;
        let sourceText = params.text || params.prompt || "";

        if (params.inputKind === "pdf") {
          if (!params.file) {
            throw new Error("Choose a PDF file first.");
          }
          const bytes = await params.file.arrayBuffer();
          sourceResult = await window.api.source.ingestPdf({
            name: params.file.name,
            bytes,
          });
          sourceText = sourceResult?.source?.sourceText || "";
        } else {
          sourceResult = await window.api.source.ingestText({
            inputKind: params.inputKind,
            text: params.text,
            prompt: params.prompt,
            title: params.inputKind === "prompt" ? params.prompt : undefined,
          });
        }

        if (!sourceResult?.success) {
          throw new Error(sourceResult?.error || "Failed to ingest source");
        }

        const source = sourceResult.source as SourceDocument;
        const mapResult = await window.api.map.generateCompression({
          sourceDocumentId: source.id,
          sourceText,
          prompt: params.prompt,
          provider,
          apiKey: provider === "openrouter" ? apiKey.trim() : undefined,
          model: activeModel,
          ollamaBaseUrl,
        });

        if (!mapResult?.success) {
          throw new Error(
            mapResult?.error || "Failed to generate compression map",
          );
        }

        const parsed = parseMarkdownToTree(mapResult.markdown);
        if (!parsed) {
          throw new Error("Failed to parse generated map");
        }

        const saved = await window.api.memory.create({
          sourceDocumentId: source.id,
          title: parsed.title,
          root: parsed,
          provider: mapResult.provider || provider,
          model: mapResult.model || activeModel,
          selectedNodeIds: [],
          selectedPathOrder: [],
          lastUsedLens: "default",
        });

        if (!saved?.success) {
          throw new Error(saved?.error || "Failed to save compression map");
        }

        setCurrentMapId(saved.document.id);
        setCurrentSource(source);
        setCurrentArtifacts([]);
        setData(parsed);
        clearPathSelection();
        setSelectionMode(false);
        setViewKey((prev) => prev + 1);
        setIsCanvasOpen(true);
        upsertMemoryDocument(saved.document);
        setSaveStatus("saved");
        setSuccessMessage("Mind map generated.");
      } catch (err) {
        void logEvent({
          level: "error",
          scope: "renderer.source",
          message: "Failed to create source and map",
          meta: {
            inputKind: params.inputKind,
            error: err instanceof Error ? err.message : String(err),
          },
        });
        setError(err instanceof Error ? err.message : "Failed to create map");
        setSaveStatus("error");
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeModel,
      apiKey,
      clearPathSelection,
      ollamaBaseUrl,
      provider,
      setData,
      upsertMemoryDocument,
    ],
  );

  useEffect(() => {
    if (!currentMapId || !root) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(async () => {
      const seq = ++autosaveSeqRef.current;
      setSaveStatus("saving");

      const saved = await window.api.memory.update({
        id: currentMapId,
        title: root.title,
        root,
        provider,
        model: activeModel,
        lastUsedLens: selectedLens,
        selectedNodeIds,
        selectedPathOrder,
      });

      if (seq !== autosaveSeqRef.current) return;

      if (saved?.success) {
        upsertMemoryDocument(saved.document);
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
      }

      if (saveResetTimerRef.current)
        window.clearTimeout(saveResetTimerRef.current);
      saveResetTimerRef.current = window.setTimeout(
        () => setSaveStatus("idle"),
        1200,
      );
    }, 650);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    activeModel,
    currentMapId,
    provider,
    root,
    selectedLens,
    selectedNodeIds,
    selectedPathOrder,
    upsertMemoryDocument,
  ]);

  const handlePromptGenerate = useCallback(() => {
    if (!prompt.trim()) {
      setError("Enter a question or task to compress into a map.");
      return;
    }
    createSourceAndMap({ inputKind: "prompt", prompt: prompt.trim() });
  }, [createSourceAndMap, prompt]);

  const handlePasteGenerate = useCallback(() => {
    if (!pasteText.trim()) {
      setError("Paste the long response or document you want to compress.");
      return;
    }
    createSourceAndMap({ inputKind: "text", text: pasteText.trim() });
  }, [createSourceAndMap, pasteText]);

  const handlePdfGenerate = useCallback(
    async (file: File | null) => {
      if (!file) {
        setError("Choose a PDF file first.");
        return;
      }
      await createSourceAndMap({ inputKind: "pdf", file });
    },
    [createSourceAndMap],
  );

  const handleCloseCanvas = useCallback(() => {
    setIsCanvasOpen(false);
    setMenuState(null);
    setAiExpandModalState(null);
    setNotesModalNode(null);
    setDeleteConfirmNode(null);
    setDetailNodeId(null);
    setSelectedNodeId(null);
    setEditingNodeId(null);
    setFocusedNodeId(null);
    setSaveStatus("idle");
  }, [setEditingNodeId, setFocusedNodeId, setSelectedNodeId]);

  const clearTransientNodeUi = useCallback(
    (options: { clearSelection?: boolean } = {}) => {
      setMenuState(null);
      setAiExpandModalState(null);
      setNotesModalNode(null);
      setDeleteConfirmNode(null);
      setEditingNodeId(null);
      if (options.clearSelection) {
        setSelectedNodeId(null);
      }
    },
    [setEditingNodeId, setSelectedNodeId],
  );

  const clearDeletedNodeUi = useCallback(() => {
    clearTransientNodeUi({ clearSelection: true });
    setDetailNodeId(null);
    setFocusedNodeId(null);
  }, [clearTransientNodeUi, setFocusedNodeId]);

  const handleNodeClick = useCallback(
    (node: MindmapNode, position: { x: number; y: number }) => {
      if (selectionMode) {
        clearTransientNodeUi();
        togglePathSelection(node.id);
        return;
      }
      setAiExpandModalState(null);
      setNotesModalNode(null);
      setEditingNodeId(null);
      setSelectedNodeId(node.id);
      setMenuState({ node, position });
    },
    [
      clearTransientNodeUi,
      selectionMode,
      setEditingNodeId,
      setSelectedNodeId,
      togglePathSelection,
    ],
  );

  const handleViewNodeDetails = useCallback(
    (node: MindmapNode) => {
      setDetailNodeId((current) => (current === node.id ? null : node.id));
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId],
  );

  const handleOpenAIExpandForNode = useCallback(
    (node: MindmapNode, position: { x: number; y: number }) => {
      setAiExpandModalState({ node, position });
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId],
  );

  const handleCloseMenu = useCallback(() => {
    setMenuState(null);
  }, []);

  const getSiblingTitles = useCallback(
    (nodeId: string): string[] => {
      if (!root) return [];

      const findParent = (
        node: MindmapNode,
        targetId: string,
      ): MindmapNode | null => {
        for (const child of node.children) {
          if (child.id === targetId) return node;
          const found = findParent(child, targetId);
          if (found) return found;
        }
        return null;
      };

      const parent = root.id === nodeId ? null : findParent(root, nodeId);
      if (!parent) return [];

      return parent.children
        .filter((child) => child.id !== nodeId)
        .map((child) => child.title);
    },
    [root],
  );

  const handleAIExpand = useCallback(
    async (customInstruction: string, lens: ThinkingLens) => {
      if (!aiExpandModalState) return;
      if (provider === "openrouter" && !apiKey.trim()) {
        setError("Please add your OpenRouter API key in Settings.");
        setIsSettingsOpen(true);
        return;
      }

      const nodeId = aiExpandModalState.node.id;
      const nodeTopic = aiExpandModalState.node.description
        ? `${aiExpandModalState.node.title}: ${aiExpandModalState.node.description}`
        : aiExpandModalState.node.title;
      setSelectedLens(lens);
      setAiExpandModalState(null);
      setExpandingNodeId(nodeId);

      try {
        const result = await window.api.map.expandNodeWithLens({
          topic: nodeTopic,
          context: getNodePath(nodeId),
          provider,
          apiKey: provider === "openrouter" ? apiKey.trim() : undefined,
          model: activeModel,
          ollamaBaseUrl,
          rootTopic: root?.title || "",
          siblings: getSiblingTitles(nodeId),
          customInstruction,
          lens,
          sourceKind: currentSource?.inputKind || "prompt",
        });

        if (!result?.success) {
          throw new Error(result?.error || "Failed to expand node");
        }

        collapseSiblings(nodeId);
        const children = parseExpandedContent(result.markdown, 1);
        if (children.length === 0) {
          void logEvent({
            level: "warn",
            scope: "renderer.expand",
            message: "AI expand returned content but produced zero parsed children. Check Diagnostics → LLM Exchanges for the raw model output.",
            meta: {
              lens,
              nodeId,
              markdownLength: result.markdown?.length || 0,
              markdownPreview: result.markdown?.slice(0, 500) || "(empty)",
            },
          });
          setError(
            "AI returned content but it could not be parsed into branches. Check Diagnostics for the raw output.",
          );
        } else {
          expandNode(nodeId, children);
          setSuccessMessage(`Expanded branch with ${lens.replace("_", " ")}.`);
        }
      } catch (err) {
        void logEvent({
          level: "error",
          scope: "renderer.expand",
          message: "Failed to expand node",
          meta: {
            lens,
            nodeId,
            error: err instanceof Error ? err.message : String(err),
          },
        });
        setError(err instanceof Error ? err.message : "Failed to expand node");
      } finally {
        setExpandingNodeId(null);
      }
    },
    [
      activeModel,
      aiExpandModalState,
      apiKey,
      collapseSiblings,
      currentSource?.inputKind,
      expandNode,
      getNodePath,
      getSiblingTitles,
      ollamaBaseUrl,
      provider,
      root?.title,
      setExpandingNodeId,
    ],
  );

  const handleGenerateBranchBrief = useCallback(async () => {
    if (!currentMapId) return;
    const result = await window.api.artifact.createBranchBrief({
      compressionMapId: currentMapId,
      selectedNodeIds,
      selectedPathOrder,
      provider,
      apiKey:
        provider === "openrouter" ? apiKey.trim() || undefined : undefined,
      model: activeModel,
      ollamaBaseUrl,
    });

    if (!result?.success) {
      void logEvent({
        level: "error",
        scope: "renderer.artifact",
        message: "Failed to generate branch brief",
        meta: { currentMapId, error: result?.error || "Unknown error" },
      });
      setError(result?.error || "Failed to generate branch brief");
      return;
    }

    setCurrentArtifacts((prev) => [
      result.artifact,
      ...prev.filter((item) => item.id !== result.artifact.id),
    ]);
    setSuccessMessage("Branch brief generated.");
  }, [
    activeModel,
    apiKey,
    currentMapId,
    ollamaBaseUrl,
    provider,
    selectedNodeIds,
    selectedPathOrder,
  ]);

  const handleDispatchToCodex = useCallback(
    async (
      branchBriefId: string,
      transport: "clipboard" | "codex_exec" = "clipboard",
    ) => {
      if (!currentMapId) return;
      const result = await window.api.handoff.dispatchToCodex({
        branchBriefId,
        compressionMapId: currentMapId,
        transport,
      });
      if (!result?.success) {
        void logEvent({
          level: "error",
          scope: "renderer.handoff",
          message: "Failed to dispatch branch brief to Codex",
          meta: {
            currentMapId,
            branchBriefId,
            error: result?.error || "Unknown error",
          },
        });
        setError(result?.error || "Failed to dispatch to Codex");
        return;
      }
      setCurrentArtifacts((prev) => [
        result.artifact,
        ...prev.filter((item) => item.id !== result.artifact.id),
      ]);
      setSuccessMessage(
        transport === "codex_exec"
          ? `Codex exec ${result.artifact.status}.`
          : "Copied Codex handoff to clipboard.",
      );
    },
    [currentMapId],
  );

  const selectedPathNodes = useMemo(
    () =>
      selectedPathOrder
        .map((id) => getNode(id))
        .filter(Boolean) as MindmapNode[],
    [getNode, selectedPathOrder],
  );

  const branchBriefs = useMemo(
    () =>
      currentArtifacts.filter(
        (item): item is BranchBriefArtifact => item.kind === "branch_brief",
      ),
    [currentArtifacts],
  );
  const handoffs = useMemo(
    () =>
      currentArtifacts.filter(
        (item): item is ExecutionHandoffArtifact =>
          item.kind === "execution_handoff",
      ),
    [currentArtifacts],
  );
  const latestBrief = branchBriefs[0] || null;

  const handleExport = useCallback(() => {
    window.dispatchEvent(new CustomEvent("export-mindmap"));
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.topBar}>
        <div>
          <div className={styles.brandEyebrow}>Flows</div>
          <div className={styles.brandTitle}>Mind Map Generator</div>
        </div>
        <nav className={styles.nav}>
          <button
            className={`${styles.navLink} ${activeTab === "generate" ? styles.navLinkActive : ""}`}
            onClick={() => setActiveTab("generate")}
          >
            Workspace
          </button>
          <button
            className={`${styles.navLink} ${activeTab === "history" ? styles.navLinkActive : ""}`}
            onClick={() => setActiveTab("history")}
          >
            Map History
          </button>
          <button
            className={styles.navLink}
            onClick={() => {
              setIsDiagnosticsOpen(true);
              void refreshDiagnostics();
            }}
          >
            Diagnostics
          </button>
          <button
            className={styles.settingsButton}
            onClick={() => setIsSettingsOpen(true)}
          >
            Settings
          </button>
        </nav>
      </header>

      {activeTab === "generate" && (
        <section className={styles.heroSection}>
          <div className={styles.heroCard}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>
                From any input to a navigable map
              </p>
              <h1 className={styles.heroHeading}>
                Generate a Mind Map
              </h1>
            </div>

            <div className={styles.inputModeRow}>
              {(["ask", "paste", "pdf"] as InputView[]).map((view) => (
                <button
                  key={view}
                  className={`${styles.inputModeButton} ${inputView === view ? styles.inputModeButtonActive : ""}`}
                  onClick={() => {
                    setInputView(view);
                    setError(null);
                  }}
                >
                  {view === "ask"
                    ? "Ask"
                    : view === "paste"
                      ? "Paste"
                      : "Drop PDF"}
                </button>
              ))}
            </div>

            {inputView === "ask" && (
              <div className={styles.sourcePanel}>
                <input
                  type="text"
                  placeholder="What do you want to map?"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className={styles.promptInput}
                  disabled={isLoading}
                  onKeyDown={(e) => e.key === "Enter" && handlePromptGenerate()}
                />
                <button
                  onClick={handlePromptGenerate}
                  disabled={isLoading || !prompt.trim()}
                  className={styles.generateButton}
                >
                  {isLoading ? "Generating…" : "Generate Map"}
                </button>
              </div>
            )}

            {inputView === "paste" && (
              <div className={styles.sourcePanel}>
                <textarea
                  className={styles.pasteInput}
                  placeholder="Paste the text, notes, or document you want to turn into a mind map."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  onClick={handlePasteGenerate}
                  disabled={isLoading || !pasteText.trim()}
                  className={styles.generateButton}
                >
                  {isLoading ? "Generating…" : "Generate Map"}
                </button>
              </div>
            )}

            {inputView === "pdf" && (
              <label className={styles.uploadPanel}>
                <span className={styles.uploadTitle}>
                  Choose a PDF and Flows will extract its text and generate a
                  mind map.
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) =>
                    handlePdfGenerate(e.target.files?.[0] || null)
                  }
                  disabled={isLoading}
                  className={styles.hiddenFileInput}
                />
                <span className={styles.uploadButton}>
                  {isLoading ? "Reading PDF…" : "Choose PDF"}
                </span>
              </label>
            )}

            {(error || successMessage) && (
              <div className={error ? styles.error : styles.successBanner}>
                {error || successMessage}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "history" && (
        <section className={styles.historySection}>
          <div className={styles.historyHeader}>
            <div>
              <h2 className={styles.historyTitle}>Mind Maps</h2>
              <p className={styles.historySubtitle}>
                All your maps, paths, briefs, and handoffs in one place.
              </p>
            </div>
            <button
              className={styles.secondaryButton}
              onClick={refreshHistory}
              disabled={isHistoryLoading}
            >
              {isHistoryLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {historyError && <div className={styles.error}>{historyError}</div>}

          {isHistoryLoading ? (
            <div className={styles.historyLoading}>Loading…</div>
          ) : memoryDocuments.length === 0 ? (
            <div className={styles.historyEmpty}>
              Create your first mind map and it will appear here.
            </div>
          ) : (
            <div className={styles.historyList}>
              {memoryDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`${styles.historyCard} ${currentMapId === doc.id ? styles.historyCardActive : ""}`}
                  onClick={() => handleOpenMemoryDocument(doc.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleOpenMemoryDocument(doc.id);
                    }
                  }}
                >
                  <div className={styles.historyCardMain}>
                    <div className={styles.historyCardTitle}>{doc.title}</div>
                    <div className={styles.historyCardMeta}>
                      Updated {new Date(doc.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className={styles.historyCardActions}>
                    <button
                      className={styles.historyActionButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenMemoryDocument(doc.id);
                      }}
                    >
                      Open
                    </button>
                    <button
                      className={`${styles.historyActionButton} ${styles.historyActionDanger}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMemoryDocument(doc.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        provider={provider}
        onProviderChange={setProvider}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        openRouterModel={openRouterModel}
        onOpenRouterModelChange={setOpenRouterModel}
        ollamaModel={ollamaModel}
        onOllamaModelChange={setOllamaModel}
        ollamaBaseUrl={ollamaBaseUrl}
        onOllamaBaseUrlChange={setOllamaBaseUrl}
        ollamaModels={ollamaModels}
        ollamaStatus={ollamaStatus}
        ollamaError={ollamaError}
        onRefreshOllamaModels={refreshOllamaModels}
      />

      <DiagnosticsPanel
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        entries={diagnosticEntries}
        logPath={logPath}
        llmEntries={llmEntries}
        llmLogPath={llmLogPath}
        isLoading={isDiagnosticsLoading}
        onRefresh={refreshDiagnostics}
      />

      <CanvasOverlay
        isOpen={isCanvasOpen}
        onClose={handleCloseCanvas}
        title={root?.title || currentSource?.title || "Mind Map"}
        onExport={handleExport}
        saveStatus={currentMapId ? saveStatus : "idle"}
      >
        <div className={styles.overlayWorkspace}>
          <div className={styles.overlayCanvasPane}>
            {root && (
              <Suspense
                fallback={
                  <div className={styles.loadingCanvas}>
                    Loading visualization...
                  </div>
                }
              >
                <MindmapCanvas
                  data={root}
                  viewKey={viewKey}
                  selectedNodeId={selectedNodeId}
                  selectedNodeIds={selectedNodeIds}
                  selectionMode={selectionMode}
                  editingNodeId={editingNodeId}
                  expandingNodeId={expandingNodeId}
                  detailNodeId={detailNodeId}
                  focusedNodeId={focusedNodeId}
                  onNodeClick={handleNodeClick}
                  onViewNodeDetails={handleViewNodeDetails}
                  onOpenAIExpand={handleOpenAIExpandForNode}
                  onNodeTitleChange={(nodeId, newTitle) =>
                    updateNode(nodeId, { title: newTitle })
                  }
                  onEditComplete={() => setEditingNodeId(null)}
                  onToggleCollapse={toggleCollapse}
                  onNodeDoubleClick={(nodeId) =>
                    setFocusedNodeId(focusedNodeId === nodeId ? null : nodeId)
                  }
                  isNodeInFocus={isNodeInFocus}
                />
              </Suspense>
            )}
          </div>

          <aside className={styles.overlayRail}>
            <div className={styles.railSection}>
              <div className={styles.railHeading}>Source</div>
              <div className={styles.railCard}>
                <div className={styles.railMetaRow}>
                  <span className={styles.metaPill}>
                    {currentSource?.inputKind || "prompt"}
                  </span>
                  <span className={styles.metaPill}>
                    {selectedLens.replace("_", " ")}
                  </span>
                </div>
                <div className={styles.railTitle}>
                  {currentSource?.title || root?.title || "Untitled source"}
                </div>
                <p className={styles.railBody}>
                  {currentSource?.sourceText?.slice(0, 220) ||
                    currentSource?.prompt ||
                    "Use this map to compress a source, challenge a branch, and dispatch the path that matters."}
                </p>
              </div>
            </div>

            <div className={styles.railSection}>
              <div className={styles.railHeading}>Selected Path</div>
              <div className={styles.railActions}>
                <button
                  className={styles.secondaryButton}
                  onClick={() => {
                    clearTransientNodeUi({ clearSelection: true });
                    setSelectionMode((value) => !value);
                  }}
                >
                  {selectionMode ? "Exit Selection" : "Select Path"}
                </button>
                <button
                  className={styles.secondaryButton}
                  onClick={clearPathSelection}
                  disabled={selectedPathOrder.length === 0}
                >
                  Clear
                </button>
              </div>
              <div className={styles.pathList}>
                {selectedPathNodes.length === 0 ? (
                  <div className={styles.emptyHint}>
                    Toggle selection mode and click nodes to build a branch
                    path.
                  </div>
                ) : (
                  selectedPathNodes.map((node, index) => (
                    <div key={node.id} className={styles.pathItem}>
                      <div>
                        <div className={styles.pathIndex}>Step {index + 1}</div>
                        <div className={styles.pathTitle}>{node.title}</div>
                      </div>
                      <div className={styles.pathControls}>
                        <button
                          className={styles.miniButton}
                          onClick={() => movePathNode(node.id, "up")}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          className={styles.miniButton}
                          onClick={() => movePathNode(node.id, "down")}
                          disabled={index === selectedPathNodes.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          className={styles.miniButton}
                          onClick={() => togglePathSelection(node.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className={styles.railActions}>
                <button
                  className={styles.primaryAction}
                  onClick={handleGenerateBranchBrief}
                  disabled={selectedPathOrder.length === 0}
                >
                  Generate Brief
                </button>
                <button
                  className={styles.secondaryButton}
                  onClick={() =>
                    latestBrief && handleDispatchToCodex(latestBrief.id)
                  }
                  disabled={!latestBrief}
                >
                  Copy for Codex
                </button>
                <button
                  className={styles.secondaryButton}
                  onClick={() =>
                    latestBrief &&
                    handleDispatchToCodex(latestBrief.id, "codex_exec")
                  }
                  disabled={!latestBrief || isLoading}
                >
                  Run Codex Exec
                </button>
              </div>
            </div>

            <div className={styles.railSection}>
              <div className={styles.railHeading}>Artifacts</div>
              {latestBrief ? (
                <div className={styles.railCard}>
                  <div className={styles.railTitle}>
                    {latestBrief.brief.title}
                  </div>
                  <p className={styles.railBody}>{latestBrief.brief.summary}</p>
                  <div className={styles.artifactList}>
                    {latestBrief.brief.keyPoints.slice(0, 4).map((point) => (
                      <span key={point} className={styles.metaPill}>
                        {point}
                      </span>
                    ))}
                  </div>
                  <div className={styles.railActions}>
                    <button
                      className={styles.primaryAction}
                      onClick={() => handleDispatchToCodex(latestBrief.id)}
                    >
                      Copy for Codex
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={() =>
                        handleDispatchToCodex(latestBrief.id, "codex_exec")
                      }
                    >
                      Run Codex Exec
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.emptyHint}>
                  Generate a branch brief to capture the chosen path.
                </div>
              )}

              {handoffs.length > 0 && (
                <div className={styles.handoffList}>
                  {handoffs.map((handoff) => (
                    <div key={handoff.id} className={styles.handoffItem}>
                      <div className={styles.pathTitle}>
                        {handoff.payload.title}
                      </div>
                      <div className={styles.historyCardMeta}>
                        Codex •{" "}
                        {handoff.transport === "codex_exec"
                          ? "exec"
                          : "clipboard"}{" "}
                        • {handoff.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </CanvasOverlay>

      {menuState && isCanvasOpen && (
        <NodeContextMenu
          node={menuState.node}
          position={menuState.position}
          isRoot={root?.id === menuState.node.id}
          onClose={handleCloseMenu}
          onColorChange={(color) => {
            setNodeColor(menuState.node.id, color);
            handleCloseMenu();
          }}
          onAddBranch={() => {
            const newNode = addChild(menuState.node.id, "New Branch");
            if (newNode) {
              setSelectedNodeId(newNode.id);
              setEditingNodeId(newNode.id);
            }
            handleCloseMenu();
          }}
          onViewDetails={() => {
            handleViewNodeDetails(menuState.node);
            handleCloseMenu();
          }}
          onAddNotes={() => {
            setNotesModalNode(menuState.node);
            handleCloseMenu();
          }}
          onOpenAIExpand={() => {
            setAiExpandModalState({
              node: menuState.node,
              position: menuState.position,
            });
            handleCloseMenu();
          }}
          onEditNode={() => {
            setEditingNodeId(menuState.node.id);
            handleCloseMenu();
          }}
          onRemoveStyles={() => {
            resetNodeStyle(menuState.node.id);
            handleCloseMenu();
          }}
          onDeleteNode={() => {
            const descendantCount = getDescendantCount(menuState.node.id);
            if (descendantCount > 0) {
              setDeleteConfirmNode(menuState.node);
            } else {
              deleteNode(menuState.node.id);
              clearDeletedNodeUi();
            }
            handleCloseMenu();
          }}
        />
      )}

      {aiExpandModalState && isCanvasOpen && (
        <AIExpandBar
          node={aiExpandModalState.node}
          position={aiExpandModalState.position}
          onClose={() => setAiExpandModalState(null)}
          onExpand={handleAIExpand}
          isExpanding={expandingNodeId === aiExpandModalState.node.id}
          selectedLens={selectedLens}
          onLensChange={setSelectedLens}
        />
      )}

      {notesModalNode && (
        <NotesModal
          node={notesModalNode}
          onSave={(notes) => setNodeNotes(notesModalNode.id, notes)}
          onClose={() => setNotesModalNode(null)}
        />
      )}

      {deleteConfirmNode && (
        <DeleteConfirmDialog
          node={deleteConfirmNode}
          descendantCount={getDescendantCount(deleteConfirmNode.id)}
          onConfirm={() => {
            deleteNode(deleteConfirmNode.id);
            clearDeletedNodeUi();
            setDeleteConfirmNode(null);
          }}
          onCancel={() => setDeleteConfirmNode(null)}
        />
      )}
    </div>
  );
}

function parseExpandedContent(
  markdown: string,
  parentLevel: number,
): MindmapNode[] {
  const lines = markdown.split("\n").filter((line) => line.trim());
  const children: MindmapNode[] = [];
  let currentNode: MindmapNode | null = null;
  let nodeId = Date.now();

  // Detect the minimum heading level in the model output
  let minLevel = 7;
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+/);
    if (m) minLevel = Math.min(minLevel, m[1].length);
  }

  // If no headings found, try plain text / bullet list fallback
  if (minLevel > 6) {
    for (const line of lines) {
      const cleaned = line
        .replace(/^[-*]\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .trim();
      if (cleaned) {
        const { title, description } = splitGeneratedHeading(cleaned);
        children.push({
          id: `expand-${nodeId++}`,
          title,
          level: parentLevel + 1,
          children: [],
          description,
        });
      }
    }
    return children;
  }

  // Parse using the detected heading levels
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length;
    const { title, description } = splitGeneratedHeading(match[2]);

    if (level === minLevel) {
      // Top-level child
      currentNode = {
        id: `expand-${nodeId++}`,
        title,
        level: parentLevel + 1,
        children: [],
        description,
      };
      children.push(currentNode);
    } else if (level === minLevel + 1 && currentNode) {
      // Sub-child
      currentNode.children.push({
        id: `expand-${nodeId++}`,
        title,
        level: parentLevel + 2,
        children: [],
        description,
      });
    }
  }

  return children;
}

function splitGeneratedHeading(raw: string): {
  title: string;
  description?: string;
} {
  const normalized = raw.replace(/\*\*/g, "").trim();
  const delimiterMatch = normalized.match(/\s+(?:::|--|—)\s+/);
  if (!delimiterMatch || delimiterMatch.index === undefined) {
    return { title: normalized };
  }
  const title = normalized.slice(0, delimiterMatch.index).trim();
  const description = normalized
    .slice(delimiterMatch.index + delimiterMatch[0].length)
    .trim();
  return {
    title: title || normalized,
    description: description || undefined,
  };
}

export type InputKind = "prompt" | "text" | "pdf";

export type ThinkingLens =
  | "default"
  | "deep_dive"
  | "questions"
  | "devils_advocate";

export type ArtifactKind =
  | "compression_map"
  | "branch_brief"
  | "execution_handoff"
  | "flowchart"
  | "checklist";

export interface MindmapNodeLike {
  id: string;
  title: string;
  level: number;
  children: MindmapNodeLike[];
  description?: string;
  notes?: string;
  branchColor?: string;
  collapsed?: boolean;
}

export type LegacyDocumentMode = "extract" | "brainstorm" | "flow";

export type SourceDocument = {
  id: string;
  title: string;
  inputKind: InputKind;
  sourceText?: string;
  sourceFile?: {
    name: string;
    mimeType: string;
    size?: number;
  };
  prompt?: string;
  createdAt: number;
  updatedAt: number;
};

export type CompressionMapDocument<TNode = MindmapNodeLike> = {
  id: string;
  kind: "compression_map";
  sourceDocumentId: string;
  title: string;
  root: TNode;
  createdAt: number;
  updatedAt: number;
  provider?: AiProvider;
  model?: string;
  lastUsedLens?: ThinkingLens;
  selectedNodeIds?: string[];
  selectedPathOrder?: string[];
  legacyDocumentMode?: LegacyDocumentMode;
};

export type BranchBrief = {
  title: string;
  objective: string;
  summary: string;
  keyPoints: string[];
  risks: string[];
  openQuestions: string[];
  recommendedNextAction: string;
  sourceNodeRefs: string[];
};

export type BranchBriefArtifact = {
  id: string;
  kind: "branch_brief";
  sourceDocumentId: string;
  compressionMapId: string;
  selectedNodeIds: string[];
  selectedPathOrder: string[];
  brief: BranchBrief;
  createdAt: number;
  updatedAt: number;
};

export type ExecutionHandoffArtifact = {
  id: string;
  kind: "execution_handoff";
  sourceDocumentId: string;
  compressionMapId: string;
  branchBriefId: string;
  target: "codex";
  payload: {
    title: string;
    objective: string;
    summary: string;
    keyPoints: string[];
    risks: string[];
    openQuestions: string[];
    recommendedNextAction: string;
    sourceContext: string;
  };
  status: "pending" | "running" | "sent" | "failed" | "completed";
  createdAt: number;
  updatedAt: number;
  transport?: "clipboard" | "codex_exec";
  codexExec?: {
    command: string[];
    cwd: string;
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
    startedAt?: number;
    finishedAt?: number;
  };
};

export type ArtifactRecord = BranchBriefArtifact | ExecutionHandoffArtifact;

export type StoreMapMeta = Pick<
  CompressionMapDocument,
  | "id"
  | "kind"
  | "sourceDocumentId"
  | "title"
  | "createdAt"
  | "updatedAt"
  | "provider"
  | "model"
  | "lastUsedLens"
  | "selectedNodeIds"
  | "selectedPathOrder"
  | "legacyDocumentMode"
>;

export type AiProvider = "ollama" | "openrouter";

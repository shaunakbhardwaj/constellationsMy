# Flows: Deep Codebase Analysis and Product Upgrade Plan

## 1) Current State Snapshot

The app is a promising prototype with strong fundamentals (Electron + React + D3 + local persistence), but it is still architected like a single-screen demo:

- Core UI and business flow are centralized in `src/renderer/src/App.tsx:36` (900 lines).
- Canvas engine + interaction logic are centralized in `src/renderer/src/components/mindmap/MindmapCanvas.tsx:133` (1087 lines).
- Long-running AI calls are one-shot `ipcRenderer.invoke(...)` without cancellation support in `src/preload/index.ts:6` and `src/preload/index.ts:7`.
- Main process AI calls use raw `fetch` with no abort/timeout/task registry in `src/main/ipc.ts:56` and `src/main/ipc.ts:91`.
- The visual design is polished in places, but it reads more “creative toy” than “consumer/B2B product” due to copy, hierarchy, and information density choices in `src/renderer/src/App.tsx:624` and `src/renderer/src/page.module.css:267`.

## 2) High-Impact Findings

### A. No task cancellation architecture (critical for product reliability)

Evidence:

- No task IDs, no abort controller map, and no cancel IPC channel (`src/main/ipc.ts:56`, `src/main/ipc.ts:91`).
- Renderer can start generation/expansion, but cannot stop in-flight requests (`src/renderer/src/App.tsx:216`, `src/renderer/src/App.tsx:412`).
- API contract is fully `any`, making safe cancellation responses hard to enforce (`src/renderer/src/env.d.ts:6`, `src/renderer/src/env.d.ts:7`).

Impact:

- User cannot stop expensive or mistaken requests.
- Slow requests block trust and make the app feel fragile.
- No clean path to support future “running tasks” (agent jobs, pipelines, background runs).

### B. Architecture concentration in two very large files

Evidence:

- `src/renderer/src/App.tsx:36` mixes home screen, history, generation, memory, canvas overlays, modals, and keyboard handling.
- `src/renderer/src/components/mindmap/MindmapCanvas.tsx:379` mixes layout, rendering, selection, editing, zooming, minimap, exporting.

Impact:

- Hard to iterate quickly on product UX.
- High regression risk for every feature change.
- Team scaling bottleneck.

### C. Inconsistent/unfinished logic in expansion flow

Evidence:

- Residual migration comments and uncertain parsing notes in production code (`src/renderer/src/App.tsx:429` to `src/renderer/src/App.tsx:437`).
- Expansion parser is local and format-fragile (`src/renderer/src/App.tsx:866`), expecting strict `###/####`.

Impact:

- Reduced confidence in behavior under varied model outputs.
- Harder to maintain and reason about expansion quality.

### D. Design system fragmentation and “toy” tone

Evidence:

- Global font remains Inter (`src/renderer/src/globals.css:1`, `src/renderer/src/globals.css:114`).
- Heavy decorative floating elements dominate primary workspace (`src/renderer/src/page.module.css:23`).
- Hero copy is whimsical and not product-grade for pro/B2B use (`src/renderer/src/App.tsx:624` to `src/renderer/src/App.tsx:631`).
- Hardcoded purple and ad-hoc colors in multiple components (`src/renderer/src/components/mindmap/MindmapCanvas.tsx:554`, `src/renderer/src/components/mindmap/AIExpandBar.module.css:8`).

Impact:

- UI looks styled, but not positioned as a serious workflow product.
- Visual language is not semantic enough for “maps -> flow -> execution”.

### E. Type safety and contract quality are too weak for scale

Evidence:

- `window.api` contract is almost entirely `any` (`src/renderer/src/env.d.ts:4` to `src/renderer/src/env.d.ts:13`).
- Preload bridge accepts and returns untyped payloads (`src/preload/index.ts:6`, `src/preload/index.ts:11`).

Impact:

- Slower refactors.
- Runtime bugs become more likely as features grow.

### F. Security/product hardening gaps

Evidence:

- Browser window uses `sandbox: false` (`src/main/index.ts:17`).
- API key is localStorage-managed in renderer (`src/renderer/src/App.tsx:45`, `src/renderer/src/App.tsx:57`).

Impact:

- Acceptable for prototype, not ideal for a mature desktop product.

## 3) Stop-Running-Tasks: Concrete Implementation Plan

This is the highest-priority implementation.

### 3.1 Main process task registry

Add a task manager in main process (new file recommended: `src/main/tasks/taskManager.ts`) with:

- `Map<string, ActiveTask>`
- `ActiveTask = { id, kind, controller, startedAt, meta }`
- helpers: `startTask`, `cancelTask`, `finishTask`, `listTasks`

Wire it into IPC:

- `task:start-generate`
- `task:start-expand`
- `task:cancel`
- `task:list` (optional, for diagnostics)

For each AI task:

- Create `AbortController`.
- Pass `signal` to `fetch`.
- Add timeout guard (ex: 60s) that aborts.
- Return structured result:
  - `{ success: true, ... }`
  - `{ success: false, cancelled: true, error: 'Task cancelled' }`
  - `{ success: false, cancelled: false, error: '...' }`

### 3.2 Preload and type-safe API contract

Replace `any` IPC contracts with typed interfaces:

- update `src/preload/index.ts`
- update `src/renderer/src/env.d.ts`

Minimum typed additions:

- `startGenerate(params): Promise<{ taskId: string } | ...>`
- `startExpand(params): Promise<{ taskId: string } | ...>`
- `cancelTask(taskId): Promise<{ success: boolean }>`

### 3.3 Renderer task UX

In `src/renderer/src/App.tsx`:

- Track task state by `taskId`.
- Replace one-way “Creating...” with reversible actions:
  - Generate button becomes `Stop` while running.
  - AI expand panel shows `Stop` while running.
- Keep expansion UI visible during active run (today it closes immediately at `src/renderer/src/App.tsx:408`).

Behavior rules:

- If user cancels, show neutral status (“Stopped”), not red error.
- Ignore stale completions using request sequence/taskId checks.
- When closing canvas, optionally auto-cancel active expand/generate tasks.

### 3.4 Acceptance criteria for stop support

- Cancel ends in-flight request within 200ms UX response and returns deterministic cancelled state.
- Cancel never mutates graph/history.
- No “stuck loading” states after cancel.
- Generate and expand both support stop.

## 4) UI/Product Upgrade Direction (Consumer + B2B)

### 4.1 Recommended design direction

Move from “ambient landing page” to “intentional workspace product”:

- Primary frame: command/workspace shell.
- Secondary frame: graph canvas with semantic controls.
- Tertiary frame: task/activity inspector.

Target feel: premium, precise, operational.

### 4.2 Information architecture changes

Split the current screen into product surfaces:

1. Workspace Header
- project/workspace context
- model + run controls
- running tasks indicator

2. Main Canvas Area
- mindmap/flow visualization
- explicit top toolbar for node/edge/selection tools

3. Right Inspector Panel
- node details
- AI actions (expand, rewrite, summarize)
- run status and logs

4. History/Memory as first-class side panel or dedicated view
- searchable
- sortable
- clear metadata and artifact types

### 4.3 Design-system upgrades

Implement a proper tokenized design system:

- typography tokens (display, body, mono)
- spacing scale
- semantic colors (`surface`, `border`, `accent`, `success`, `warning`, `danger`)
- motion presets

Suggested immediate fixes:

- Replace Inter-only stack in `src/renderer/src/globals.css:1`.
- Remove floating decorative chips from default workspace (`src/renderer/src/page.module.css:23`).
- Replace playful hero copy with crisp product messaging (`src/renderer/src/App.tsx:624`).
- Replace emoji-based hints in canvas footer with iconography/text (`src/renderer/src/components/layout/CanvasOverlay.tsx:112`).

### 4.4 Interaction upgrades for “real product” feel

- Persistent command bar in canvas (not hidden behind node context only).
- Explicit run lifecycle UI: queued/running/stopped/failed/completed.
- Multi-select + selection tray (aligns with product vision in `productvision.md`).
- Deterministic keyboard command set with visible shortcuts.

## 5) Core Refactor Plan (Maintainability)

### 5.1 Break up `App.tsx`

Extract to:

- `features/generate/GenerateView.tsx`
- `features/history/HistoryView.tsx`
- `features/canvas/CanvasWorkspace.tsx`
- `features/tasks/useTaskRuns.ts`
- `features/memory/useMemoryDocuments.ts`

Goal: keep `App.tsx` as orchestration and routing only.

### 5.2 Break up `MindmapCanvas.tsx`

Extract modules:

- `layout/bilateralLayout.ts`
- `render/renderNodes.ts`
- `render/renderLinks.ts`
- `interaction/zoomController.ts`
- `interaction/editingController.ts`
- `export/exportPng.ts`

Goal: isolate D3 rendering from interaction policy.

### 5.3 Parsing and domain cleanup

- Move expansion parsing out of `App.tsx:866` into `src/renderer/src/lib/parseMarkdown.ts`.
- Create shared parser utilities and stricter heading normalization.
- Remove migration comments from runtime paths.

## 6) Data Model and Persistence Evolution

Current `MemoryStore` is fine for MVP and local-first, but insufficient for upcoming product scope.

Next-step schema additions:

- document type (`brainstorm`, `flowchart`, `artifact`)
- links between source brainstorm and derived flowcharts
- selection sets
- edge metadata
- node semantic type metadata
- schema version per document (not only index)

Files to evolve:

- `src/main/memory/store.ts`
- `src/main/ipc.ts`

## 7) Suggested 6-Week Delivery Plan

### Week 1

- Implement cancellable task architecture (main + preload + renderer).
- Add typed task contracts and cancellation UX.

### Week 2

- Refactor `App.tsx` into feature modules.
- Refactor expansion parser and remove dead/uncertain logic.

### Week 3

- Introduce design tokens + typography system.
- Replace current landing shell with workspace shell.

### Week 4

- Introduce task/activity inspector panel.
- Upgrade history with search/sort metadata.

### Week 5

- Refactor `MindmapCanvas.tsx` into composable modules.
- Improve render/update performance and testability.

### Week 6

- Final polish pass for consumer/B2B fit:
  - copy and tone normalization
  - accessibility sweep
  - security hardening (sandbox posture, credential handling)

## 8) Immediate Action List (Do First)

1. Build cancellable task manager in main process.
2. Add typed `cancelTask` API through preload and `window.api`.
3. Change Generate/Expand UI from one-way loading to `Run/Stop`.
4. Keep AI expand UI open while run is active.
5. Replace playful landing copy with product-grade messaging.
6. Start splitting `App.tsx` and `MindmapCanvas.tsx` before adding more features.

---

If you want, I can take this plan and execute Phase 1 directly in code next: add the full stop-task implementation end-to-end (main/preload/renderer) with typed contracts and a visible `Stop` button in both generate and expand flows.

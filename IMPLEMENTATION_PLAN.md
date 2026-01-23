# Implementation Plan: Brainstorm → Selection Mode → Flowchart (No Modes)

This plan updates the product to a single unified experience:
1) user generates a brainstorm mindmap,
2) user enters a dedicated **Selection Mode** to pick an executable path,
3) app generates a **Flowchart artifact** from that selection,
4) **original brainstorm map is always preserved**.

No code in this document; it is intended to be followed phase-by-phase to avoid breaking existing behavior.

---

## Goals (from product vision + your modifications)

- Remove mode selection UI; generating always produces a brainstorm map.
- Add a **Selection Mode** toggle (e.g. “Flowchart” button) on the canvas.
  - When Selection Mode is on: **everything is dimmed by default**.
  - User selects the path/flow they want to execute.
  - User presses a **Submit/Generate** button to create a flowchart.
- Add **shape semantics** (node types) and **edge semantics** (arrowheads, labels, solid/dotted, color).
- Persist:
  - the original brainstorm mindmap,
  - selection sets (optional but recommended),
  - derived flowchart artifacts linked back to the brainstorm source.
- Delete all **extract mode** logic and prompts to keep the codebase lean.
- Update prompts to support the new workflow (brainstorm → selection → flowchart).


Make sure to have debugging print statements so it is easier to test/debug.

---

## Non-goals (for initial MVP)

- Free drawing / arbitrary shapes and lines.
- Pixel pushing / manual layout; layout remains automated.
- Over-styling (beyond color + solid/dotted + basic shapes).
- Cloud sync; keep local-first.

---

## Phase 0 — Baseline & guardrails (do first)

**Objective:** ensure we can ship incrementally without regressions.

- Add a short manual regression checklist (app loads, generate works, open/save history works, export works).
- Add feature flags (internal constants) for staged rollout:
  - `selectionModeEnabled`
  - `edgesEnabled`
  - `shapesEnabled`
  - `flowchartArtifactEnabled`
- Confirm current storage compatibility:
  - existing `.flows-memory` documents must continue to open.

**Exit criteria**
- App behavior unchanged.
- All existing saved docs still open.

---

## Phase 1 — Remove “modes” and delete Extract mode (lean-down)

**Objective:** eliminate mode selection and all Extract-related logic safely.

### 1A) UI removal
- Remove the mode selector UI (currently “Extract / Brainstorm / Flow”).
- Keep the existing prompt input and “Generate” flow.

### 1B) Code cleanup (extract removal)
- Remove `extract` from:
  - any `DocumentMode` union types,
  - palettes/root colors and any mode-specific styling,
  - any storage metadata that assumes extract exists.
- Remove Extract prompt file(s) (if present) and any loading logic that expects it.

### 1C) Backward compatibility for memory docs
- When opening an older doc that has `documentMode: 'extract'`:
  - treat it as `brainstorm` for rendering/styling.
  - (Optional) migrate on save: rewrite metadata to `brainstorm`.

**Exit criteria**
- No “mode” UI remains.
- No Extract prompt remains.
- Old docs with extract mode still open without errors.

---

## Phase 2 — Selection Mode UX (dim-all, multi-select, path tray)

**Objective:** implement Selection Mode as a deliberate state entered from the canvas.

### 2A) Add Selection Mode toggle
- Add a top-of-canvas primary button: `Flowchart` (or `Select Path`).
- Clicking it toggles **Selection Mode**:
  - ON: dim everything by default; selection becomes the primary interaction.
  - OFF: normal brainstorming editing interaction.

### 2B) Multi-select model (data + persistence)
- Replace single-node selection state with:
  - `selectedNodeIds: Set<string> | string[]`
  - `selectedPathOrder: string[]` (ordered list shown in tray)
- Persist selection state with the brainstorm document (recommended):
  - store named sets (e.g. “Path A”) or at least “lastSelection”.

### 2C) Selection interactions
- Default state in Selection Mode: all nodes dim.
- Selecting a node makes it “active” (crisp); unselected remain dim.
- Support:
  - toggle select (click),
  - additive select (cmd/ctrl-click),
  - range select (shift-click) (optional for MVP),
  - “include children” on a node,
  - “exclude sub-branch” on a node.

### 2D) “Selected Path” tray
- Add a tray panel in the canvas overlay that shows:
  - ordered selected nodes,
  - ability to reorder (start with up/down buttons; add drag-and-drop later),
  - quick actions: include children / exclude sub-branch / remove from path / clear all.

### 2E) Submit / generate CTA
- While in Selection Mode, show:
  - `Generate Flowchart` (disabled until selection is non-empty),
  - `Cancel` to exit Selection Mode without generating.

**Exit criteria**
- User can enter Selection Mode, select nodes, reorder, and submit.
- Selection persists on save/load.
- No flowchart generation yet (submit can be stubbed initially).

---

## Phase 3 — Edges (connect, arrowheads, label, style)

**Objective:** introduce connections as first-class editable objects (without rewriting the whole layout engine).

### 3A) Data model
- Introduce an edges array separate from the existing tree:
  - `edges: { id, fromId, toId, label?, color?, pattern: 'solid'|'dotted' }[]`
- Keep tree as the “brainstorm structure of truth”; edges are overlays.

### 3B) Edge creation UX (“Connect”)
- Add a “Connect” tool in a top toolbar or node context menu:
  - click node A → choose Connect → click node B to create an edge A→B.
- Add edge selection + deletion.

### 3C) Edge editing UX
- When an edge is selected:
  - edit `label`,
  - change `color`,
  - toggle `solid/dotted`.

### 3D) Rendering
- Render arrowheads for edges.
- Respect edge color and pattern.
- In Selection Mode, edges obey the same dimming rules (dim by default; selected-path edges crisp).

**Exit criteria**
- User can connect nodes and see arrowed edges.
- User can label edges and toggle solid/dotted + color.
- Edges persist in memory docs.

---

## Phase 4 — Shapes (node types + solid/dotted outlines)

**Objective:** add semantic shapes and minimal styling controls.

### 4A) Node types
- Add `nodeType` to nodes:
  - `idea | process | decision | input | output | start | end | draft`
- Default brainstorm nodes to `idea`.

### 4B) Node style controls
- Add toolbar controls (available in normal + selection mode as appropriate):
  - set node type for selected node(s),
  - toggle node outline `solid/dotted` (or “draft” can imply dashed).

### 4C) Rendering
- Render by nodeType:
  - process: rectangle
  - decision: diamond
  - input/output: parallelogram
  - start/end: oval/pill
  - draft: dashed outline + lower opacity (or dedicated “ghost” treatment)

**Exit criteria**
- Node type can be changed via UI and persists.
- Shapes render correctly without breaking existing layout/interaction.

---

## Phase 5 — Flowchart generation (derived artifact, preserve brainstorm)

**Objective:** generate an actual flowchart from the selection, while keeping the brainstorm map intact.

### 5A) Artifact concept
- Introduce a “Flowchart” artifact linked to the brainstorm document:
  - `sourceDocumentId`
  - a snapshot of the selection (ordered node ids + titles + optional edges)
  - generated flowchart graph: nodes + edges with types/labels/styles
- Persist the flowchart artifact separately (recommended) but linked in Memory UI.

### 5B) Prompting & IPC
- Add a new prompt specifically for “selection → flowchart graph”.
- Add an IPC endpoint for generating flowcharts from selection data:
  - input: ordered selected nodes + their paths + any user-created edges/labels
  - output: structured flowchart representation (prefer JSON for reliability)

### 5C) Flowchart view
- Add a small in-overlay view switcher:
  - `Brainstorm` | `Flowchart`
  - This is not “mode selection”; it’s viewing different artifacts derived from the same work.

**Exit criteria**
- Pressing “Generate Flowchart” creates a flowchart artifact and opens it.
- Brainstorm mindmap remains unchanged and still available.
- Flowchart is saved and re-openable from Memory.

---

## Phase 6 — Flowchart layout (directional)

**Objective:** render the flowchart as a directional diagram (not a bilateral mindmap).

- Implement a directional layout for flowchart view only:
  - top-down or left-right
  - consistent spacing, arrow routing, and label placement
- Keep brainstorm view layout unchanged to reduce risk.

**Exit criteria**
- Flowchart view reads like a flowchart: directional, arrowheads, labels, shapes.

---

## Phase 7 — Toolbar design (finalize the “top options” bar)

**Objective:** consolidate controls into a clean, predictable UX.

Top toolbar in the canvas overlay should include (minimal MVP set):
- `Flowchart` (toggles Selection Mode)
- Node tools (enabled when a node or nodes selected):
  - `Type` dropdown (process/decision/input/output/start/end/draft)
  - `Outline` toggle (solid/dotted) or “Draft”
- Edge tools (enabled when an edge selected):
  - `Line` toggle (solid/dotted)
  - `Color` picker
  - `Label` editor
- Selection Mode actions:
  - `Generate Flowchart`
  - `Cancel`

**Exit criteria**
- All key actions accessible without hunting through context menus.
- Context menus can remain as shortcuts, not the only path.

---

## Phase 8 — Prompt updates (brainstorm + expand + flowchart)

**Objective:** make prompts match the product states and data model.

- Brainstorm generation prompt: optimize for divergent branches (existing brainstorm prompt can be refined).
- Expand prompt: ensure it respects node types (if we expose type to the model).
- Flowchart generation prompt:
  - takes selected nodes (ordered), user edges (optional), and asks for:
    - node list with `type`
    - edge list with `label`
    - optional “missing steps / preconditions / outputs”
  - output should be **strict JSON** (recommended) to avoid brittle parsing.

**Exit criteria**
- All prompts exist and are used by the correct actions.
- Flowchart generation output is parseable and stable.

---

## Phase 9 — Cleanup & migrations

**Objective:** keep the repo lean and avoid long-term “dead code”.

- Remove any leftover “flow mode” generation paths that are no longer used.
- Remove unused palettes/themes tied to removed modes.
- Add graceful migrations for:
  - older docs without edges/nodeType/selection/artifacts
  - older docs with `documentMode: 'extract'`

**Exit criteria**
- No unused “mode” code remains.
- Existing user data still loads.

---

## Recommended execution order (safest)

1) Phase 0 (guardrails)
2) Phase 1 (remove modes + delete extract)
3) Phase 2 (Selection Mode + tray)
4) Phase 3 (edges + labels + style)
5) Phase 4 (shapes + node types)
6) Phase 5 (generate flowchart artifact, preserve brainstorm)
7) Phase 6 (directional layout)
8) Phase 7 (toolbar polish)
9) Phase 8–9 (prompt hardening + cleanup)

---

## Key decisions to confirm before Phase 5

1) Should the generated flowchart be stored as:
   - (A) a separate Memory document linked to the brainstorm, or
   - (B) embedded inside the brainstorm doc as an “artifact” field?
2) Should selection sets be named (Path A/B) from day 1, or just “current selection” first?
3) For shapes: do we want “dotted shape” as a general outline toggle, or only via `draft`/`ghost` semantics?


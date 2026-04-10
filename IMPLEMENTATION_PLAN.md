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
- Replace weak document modes with stronger **thinking lenses** applied at the moment of expansion or conversion.
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

## Product thesis (office-hours synthesis)

The product should not be framed as "pick a generation mode and get a different-looking map."

The stronger product is:

1) start from a messy idea,
2) explore it broadly,
3) interrogate promising branches with different thinking lenses,
4) select the useful path,
5) convert that path into an actionable artifact.

That means the core loop becomes:

- **Generate** for breadth
- **Expand with intent** for depth
- **Select a path** for narrowing
- **Convert** for execution

This is a much stronger promise than `Extract / Brainstorm / Flow`, because those modes currently change prompts more than user outcome.

### Recommended wedge

Lead with:

**From vague idea to actionable path**

Target users:

- solo builders
- PMs
- students
- creators

Shared job-to-be-done:

> "I have a fuzzy topic and I want help exploring it, pressure-testing it, and turning one branch into a plan."

### Product decisions implied by this thesis

- `Brainstorm` stays the default generation behavior.
- `Flow` stops being a generation mode and becomes a **derived artifact/view**.
- `Extract` is removed as a top-level mode.
- prompt specialization moves to **expansion lenses** such as:
  - `Deep Dive`
  - `Questions`
  - `Devil's Advocate`
  - future candidates: `Examples`, `Strategy`, `Risks`, `Plan`

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
- Expand the checklist to explicitly cover mode-related regressions we already found:
  - generating in each existing mode uses the expected prompt,
  - opening a saved document restores its rendering state correctly,
  - autosave does not silently rewrite document metadata,
  - flow artifacts render directionally rather than as bilateral maps.
- Add feature flags (internal constants) for staged rollout:
  - `selectionModeEnabled`
  - `thinkingLensesEnabled`
  - `edgesEnabled`
  - `shapesEnabled`
  - `flowchartArtifactEnabled`
- Confirm current storage compatibility:
  - existing `.flows-memory` documents must continue to open.

**Exit criteria**
- App behavior unchanged.
- All existing saved docs still open.

---

## Phase 0.5 — Repair the current mode bugs before removing modes

**Objective:** stabilize current behavior so we migrate from a correct baseline instead of a broken one.

### 0.5A) Restore saved document mode on open
- When opening a saved document, restore its stored `documentMode` into renderer state before painting the canvas.
- Guard older or unknown values by mapping:
  - `extract -> brainstorm`
  - invalid/missing -> `brainstorm`

### 0.5B) Stop silent metadata drift
- Ensure autosave writes the correct mode/view metadata for the currently opened document.
- Add a regression check for:
  - create doc in one mode,
  - open it later,
  - make an edit,
  - confirm metadata is not unintentionally rewritten.

### 0.5C) Fix incomplete visual mode application
- Remove any hardcoded root-node color that ignores the active rendering state.
- Ensure any temporary mode styling applies consistently or is fully removed.

### 0.5D) Acknowledge the structural mismatch
- Document and isolate the fact that current `flow` generation still renders in the bilateral mindmap layout.
- Do not invest further in `flow` as a generation mode after this repair step.

**Exit criteria**
- Saved documents reopen with the expected state.
- No silent mode rewrites occur on edit/autosave.
- Temporary mode visuals are internally consistent until the new model ships.

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

## Phase 1.5 — Replace document modes with expansion lenses

**Objective:** preserve the valuable prompt specialization without forcing users to choose a document-wide mode up front.

### 1.5A) Product model
- Keep generation simple: every new document starts as a brainstorm map.
- Move prompt specialization to the moment of expansion:
  - default expand
  - `Deep Dive`
  - `Questions`
  - `Devil's Advocate`
- Treat these as **thinking moves**, not document types.

### 1.5B) UI
- Add lens buttons directly to the AI expand surface.
- Keep the default action obvious; advanced lenses should feel like power-ups, not required setup.
- Add short helper copy so the user understands the job of each lens:
  - `Deep Dive`: go technical and specific
  - `Questions`: expose what to investigate
  - `Devil's Advocate`: surface risks and objections

### 1.5C) Prompt routing
- Route each lens to its own prompt file.
- Pass enough local branch context so the lens feels branch-aware rather than globally generic.
- Preserve custom user instructions as an additional steering input.

### 1.5D) Data and telemetry
- Persist the last-used lens per expansion action if useful for UX, but do not make it document-defining metadata.
- Track which lenses actually get used; remove dead ones quickly.

**Exit criteria**
- Users can deepen a branch with intent without committing the whole document to a mode.
- Prompt specialization survives mode removal and becomes more legible to the user.

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
- Expand prompts:
  - default expand for neutral continuation,
  - lens-specific prompts for `Deep Dive`, `Questions`, and `Devil's Advocate`,
  - ensure prompts respect node types and branch context when available.
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

## Phase 8.5 — Make the output feel like a real deliverable

**Objective:** turn the "awesome product" moment into something stronger than a prettier map.

- When generating a flowchart artifact, also generate optional companion outputs:
  - checklist
  - step-by-step plan
  - risks / open questions
- Let the user choose one primary output initially; avoid generating every artifact every time.
- Make the generated artifact easy to review and refine:
  - show what came from selected nodes,
  - show inferred missing steps separately,
  - allow regenerate from the same selection.

**Exit criteria**
- The product delivers an execution-ready artifact, not just a transformed visualization.
- The value proposition is visibly "thinking to action," not "mindmap to mindmap."

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
2) Phase 0.5 (repair current mode bugs)
3) Phase 1 (remove modes + delete extract)
4) Phase 1.5 (ship expansion lenses)
5) Phase 2 (Selection Mode + tray)
6) Phase 3 (edges + labels + style)
7) Phase 4 (shapes + node types)
8) Phase 5 (generate flowchart artifact, preserve brainstorm)
9) Phase 6 (directional layout)
10) Phase 7 (toolbar polish)
11) Phase 8 + 8.5 (prompt hardening + deliverable outputs)
12) Phase 9 (cleanup)

---

## Key decisions to confirm before Phase 5

1) Should the generated flowchart be stored as:
   - (A) a separate Memory document linked to the brainstorm, or
   - (B) embedded inside the brainstorm doc as an “artifact” field?
2) Should selection sets be named (Path A/B) from day 1, or just “current selection” first?
3) For shapes: do we want “dotted shape” as a general outline toggle, or only via `draft`/`ghost` semantics?

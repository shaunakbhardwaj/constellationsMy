# Work Log

## Purpose

This file is the canonical "what changed" log for the Sarajevo `Flows` workspace.

It should answer:

- what was implemented
- why those changes were made
- what product and UX decisions were chosen
- what is intentionally incomplete or simplified
- what risks or follow-ups remain

This file is meant for humans first. It should stay readable and opinionated.

---

## 2026-04-12 — Mind map interaction/state hardening

## Goal

Fix the mind map canvas interaction bugs where node menus appeared away from the selected node, second-node clicks were swallowed while a menu was open, inline branch editing only accepted one character, and deleting edited/focused nodes could leave the canvas in a dimmed or stuck UI state.

---

## What was changed

The D3 canvas now keeps transient React UI state out of the expensive full SVG redraw path. Selection, path-selection opacity, focus dimming, and expansion styling are applied through lightweight in-place effects instead of recreating the entire D3 graph. This specifically protects node-to-node clicks from being lost when a context menu closes during the document-level `pointerdown` phase.

Node click positioning was also changed so menus anchor from the node's post-zoom screen geometry rather than the stale raw mouse click coordinate. Clicking a node now computes the same centered zoom transform that the canvas will animate toward, then places the context menu beside that target node position.

Inline editing now treats the D3 `foreignObject` input as DOM-local while the user is typing. The app commits the new node title on Enter or blur, instead of pushing every keystroke into React state and forcing the SVG/input to be destroyed and recreated.

The app-level node UI cleanup was tightened. Closing the map, switching selection mode, clicking a new node, and deleting a node now clear stale menu/edit/AI/notes/focus/detail state more deliberately, so a deleted focused node should not leave the rest of the map dimmed.

The hover actions, context menu, and AI expand bar received small motion/radius polish so the hover controls appear closer to the node with a smoother fade/scale transition and the popovers better match the warm monochrome surface rules.

---

## Decisions

- Treat D3-rendered map geometry as the expensive durable layer and React popovers/editing state as transient UI layered over it.
- Selection/focus/expansion visuals should be updated in place where possible, not by rebuilding the whole SVG.
- Menu coordinates should be derived from node layout plus zoom transform, not from the pointer event that happened before the zoom animation.
- Inline editing should commit on completion rather than synchronizing every character through React state.
- Deleting any node clears focused/detail/edit transient state conservatively instead of trying to preserve a potentially invalid focused branch.

---

## Verification

Ran:

- `npm run typecheck`

The TypeScript node and web checks passed.

---

## Deferred / Known Limitations

This pass was code-level and typecheck-verified. It still needs hands-on Electron/browser dogfooding for the exact flows:

- click node A, then click node B without first clicking empty space
- add branch, type a multi-character title, blur/Enter to commit
- delete a newly created/edited node and confirm normal focus/opacity returns
- hover node actions during pan/zoom

## 2026-04-10 — Blueprint 2.0 implementation pass

## Goal

Shift `Flows` away from being an "AI mindmapping" app with weak top-level modes and toward a source-first product:

- ingest prompt, pasted text, or PDF
- compress source material into a navigable map
- let users deepen branches with explicit thinking lenses
- let users select a path
- generate a structured branch brief
- dispatch that brief to Codex as the first paired-agent workflow

---

## What was changed

## 1. Replaced the old product model in code

The app previously centered around `documentMode`:

- `extract`
- `brainstorm`
- `flow`

That model was weak both product-wise and technically:

- the modes changed prompts more than outcomes
- `flow` still rendered as a bilateral mind map
- saved mode state was fragile

The new implementation treats every document as a **compression map** instead of a "mode-specific mind map."

### Main decision

The product model is now:

- source document
- compression map
- branch brief artifact
- execution handoff artifact

This better matches the actual user journey and avoids stuffing unrelated state into one document blob.

---

## 2. Added a shared contracts layer

Created:

- [src/shared/contracts.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/shared/contracts.ts)

### Why

The main process, preload bridge, and renderer were all implicitly sharing shapes through `any`.

That would have made this refactor brittle, especially with:

- new source types
- new artifact types
- new branch-brief and handoff payloads

### Key decision

Move the product vocabulary into explicit shared types:

- `InputKind`
- `ThinkingLens`
- `ArtifactKind`
- `SourceDocument`
- `CompressionMapDocument`
- `BranchBriefArtifact`
- `ExecutionHandoffArtifact`

This gives the app a stable product-level schema instead of a renderer-only UI model.

---

## 3. Rebuilt persistence around sources, maps, and artifacts

Replaced:

- [src/main/memory/store.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/main/memory/store.ts)

### What changed

The store now persists:

- sources in `sources/`
- compression maps in `maps/`
- artifacts in `artifacts/`

It also keeps a v2 index with:

- source metadata
- map metadata
- artifact metadata

### Migration decision

Legacy docs from the old `docs/` format are still read-compatible.

During migration:

- old docs are converted into a new source document
- the old root becomes a compression map
- old `documentMode` is preserved only as legacy metadata

### Why this design

The plan explicitly said:

- do not store everything as one polymorphic evolving blob

This implementation follows that. It makes later additions like:

- checklists
- flowcharts
- decision records

much easier to add cleanly.

---

## 4. Rebuilt IPC around the new product surface

Replaced:

- [src/main/ipc.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/main/ipc.ts)

Added IPC flows for:

- `source:ingest-text`
- `source:ingest-pdf`
- `map:generate-compression`
- `map:expand-node-with-lens`
- `artifact:create-branch-brief`
- `artifact:list-by-document`
- `handoff:dispatch-to-codex`

### Why

The old IPC was shaped around:

- generate mindmap
- expand node
- memory CRUD

That was not enough for the new product.

### Key decision

The main process now owns the higher-level product operations, not just low-level storage:

- ingest source
- call model with the right prompt
- generate artifact
- package handoff payload

This keeps renderer code simpler and makes future integrations easier.

---

## 5. Added real PDF ingestion

Changed:

- [package.json](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/package.json)
- [package-lock.json](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/package-lock.json)

### What changed

Installed `pdf-parse` and wired PDF extraction through the main process.

### Why

The product promise now includes `Drop PDF`.

Without actual extraction, that would have been fake UX.

### Decision

Use a real parser now rather than postponing PDF support behind placeholder UI.

### Limitation

This is text extraction only.

It does not yet:

- preserve page structure
- preserve section hierarchy
- extract tables semantically
- provide page citations

That is acceptable for MVP because the immediate goal is compression, not perfect document reconstruction.

---

## 6. Replaced old prompts with new product prompts

Added:

- [resources/prompts/compression.md](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/resources/prompts/compression.md)
- [resources/prompts/expand-default.md](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/resources/prompts/expand-default.md)
- [resources/prompts/expand-deep-dive.md](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/resources/prompts/expand-deep-dive.md)
- [resources/prompts/expand-questions.md](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/resources/prompts/expand-questions.md)
- [resources/prompts/expand-devils-advocate.md](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/resources/prompts/expand-devils-advocate.md)
- [resources/prompts/branch-brief.md](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/resources/prompts/branch-brief.md)

### Design decision

Prompting is now split into:

- one document-level compression prompt
- multiple branch-level lens prompts
- one artifact-generation prompt

### Why

This matches the new product model:

- generate map once
- choose thinking move later

This is a better UX than forcing the whole document into one top-level mode up front.

---

## 7. Rebuilt the home screen around source-first ingestion

Replaced major renderer logic in:

- [src/renderer/src/App.tsx](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/App.tsx)

### UX changes

Removed mode selector.

Added explicit source actions:

- `Ask`
- `Paste`
- `Drop PDF`

### Why this UX

This makes the app legible immediately.

The user no longer has to understand abstract product modes before starting.

Instead they choose the shape of their input, which is much easier to understand.

### Decision

The home screen language was shifted away from:

- mindmapping
- brainstorming

and toward:

- compression
- selection
- dispatch

because that is the stronger product story.

---

## 8. Added thinking lenses to expansion

Changed:

- [src/renderer/src/components/mindmap/AIExpandBar.tsx](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/components/mindmap/AIExpandBar.tsx)
- [src/renderer/src/components/mindmap/AIExpandBar.module.css](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/components/mindmap/AIExpandBar.module.css)

### New lens options

- `Expand`
- `Deep Dive`
- `Questions`
- `Devil’s Advocate`

### UX decision

These are shown at the moment of expansion, not globally.

### Why

This turns them into **thinking moves** rather than document identities.

That is more powerful and less confusing.

For example:

- a user can challenge one branch with skepticism
- and deepen another branch technically

without redefining the entire map.

---

## 9. Made path selection a first-class interaction

Changed:

- [src/renderer/src/lib/useMindmapState.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/lib/useMindmapState.ts)
- [src/renderer/src/components/mindmap/MindmapCanvas.tsx](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/components/mindmap/MindmapCanvas.tsx)
- [src/renderer/src/App.tsx](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/App.tsx)

### What changed

Added:

- multi-node path selection state
- path ordering
- clear/remove/reorder controls
- selection-mode dimming

### Why

Selection is the bridge between:

- exploration
- execution

Without selection, the app is still mostly a reading surface.

### UX decision

Selection lives in the right rail as a visible running path.

That makes the user’s current “working branch” explicit instead of hidden in canvas state.

---

## 10. Added branch brief artifacts

### What changed

Users can now generate a structured branch brief from the current selection.

The brief includes:

- title
- objective
- summary
- key points
- risks
- open questions
- recommended next action

### Design decision

The brief is the first real execution artifact.

It is intentionally more useful than “just another transformed map.”

### Why

This is the first payoff that makes the product feel like a routing tool instead of just a visualization tool.

---

## 11. Added the first Codex handoff

### What changed

Users can send the latest branch brief to Codex.

### Current MVP transport

This is currently implemented as:

- create execution handoff artifact
- format a structured payload
- copy it to clipboard
- mark the handoff as `sent`

### Why this was chosen

This gives a real end-to-end workflow now without overcommitting to a deeper integration contract too early.

### UX decision

The product promise becomes real:

- compress
- select
- brief
- dispatch

even though the transport is still lightweight.

### Limitation

This is not yet a live protocol integration with a running Codex session.

It is a pragmatic local-first MVP.

---

## 12. Simplified rendering away from mode-based styling

Changed:

- [src/renderer/src/components/mindmap/MindmapCanvas.tsx](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/components/mindmap/MindmapCanvas.tsx)

### What changed

Removed dependency on top-level document-mode palettes and root colors.

Rendering now uses:

- a neutral root color
- a fixed branch palette
- selection dimming for chosen paths

### Why

Mode-based visual styling no longer matches the product model.

The canvas should communicate:

- branch structure
- selection
- focus

not old mode identity.

---

## 13. Updated compiler scope for shared contracts

Changed:

- [tsconfig.node.json](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/tsconfig.node.json)
- [tsconfig.web.json](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/tsconfig.web.json)

### Why

`src/shared/` is now a first-class part of the app contract.

Both the main process and renderer need to compile against it.

---

## UX and product decisions made in this pass

## Decisions that were intentionally made

1. The app now starts from input type, not abstract mode.
2. Compression is the primary story, not brainstorming.
3. Branch-level thinking lenses replace top-level document modes.
4. Path selection is a primary interaction, not a later polish item.
5. The first execution artifact is a branch brief.
6. The first paired integration is Codex only.
7. The Codex handoff is clipboard-based for now.
8. PDF support is real but text-only.
9. Old docs stay readable, but new docs stop depending on `documentMode`.
10. Artifacts are stored separately rather than mutating the base map into different shapes.

---

## What is intentionally still lightweight

These are not bugs; they are current MVP boundaries.

- Codex handoff is not a live app integration yet.
- PDF extraction is plain text only.
- Branch brief generation has an LLM path and a deterministic fallback, but no editing UI yet.
- Artifact viewing is in a simple right rail, not a full artifact workbench.
- Flowchart remains deferred.
- There is no checklist artifact yet.
- Selection mode supports choosing and ordering nodes, but not richer branch include/exclude semantics.

---

## Verification completed

Ran successfully:

- `npm run typecheck`
- `npm run build`

The build regenerated tracked `out/` assets as part of verification.

---

## Suggested interpretation of this pass

This pass is a strong structural pivot.

It does **not** complete the entire product vision, but it does change the app from:

- a mode-driven AI mindmap experiment

to:

- a source-ingestion, compression, branch-selection, artifact, and dispatch workflow

That is the correct foundation for making the product genuinely unique.

---

## 2026-04-10 — Parser hardening for malformed compression output

## Problem

The app hit `Failed to parse generated map` when the model returned output that did not strictly follow heading-only markdown.

That is a bad UX failure because:

- the model call already succeeded
- the user still gets blocked
- weaker or less obedient models can miss exact formatting

## What changed

Updated:

- [src/renderer/src/lib/parseMarkdown.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/lib/parseMarkdown.ts)
- [resources/prompts/compression.md](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/resources/prompts/compression.md)

The parser now:

- prefers real markdown headings when present
- falls back to turning plain text lines into headings when headings are missing
- normalizes bullets and numbered lines into branch titles

The compression prompt was also tightened so the output format is more explicit.

## Design decision

Compression-map generation should be resilient to imperfect model formatting.

The product should degrade into a usable map whenever possible instead of failing hard on formatting alone.

---

## 2026-04-10 — Added real runtime logging

## Problem

The app had almost no durable logs.

That meant failures were mostly visible only as:

- transient UI errors
- ad hoc console output

This is not enough for a product that now has:

- ingestion
- PDF parsing
- model calls
- artifact generation
- handoff behavior

## What changed

Added:

- [src/main/logger.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/main/logger.ts)
- [src/renderer/src/lib/logger.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/lib/logger.ts)

Updated:

- [src/main/ipc.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/main/ipc.ts)
- [src/preload/index.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/preload/index.ts)
- [src/renderer/src/env.d.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/env.d.ts)
- [src/renderer/src/App.tsx](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/App.tsx)

## Design decision

Logs should be:

- durable
- local-first
- structured enough to inspect later
- cheap to add to new flows

So the logger now writes JSON lines to:

- `.flows-memory/logs/app.log` in dev

Each entry includes:

- timestamp
- level
- scope
- message
- metadata

## Why this design

This is enough to make failures inspectable without introducing a larger observability system.

It also matches the local-first nature of the app and can be extended later into:

- log viewer UI
- export support
- filtered diagnostics

---

## 2026-04-10 — Added in-app diagnostics panel

## Problem

File-backed logs are useful, but they still require the user to know:

- where the log file lives
- how to inspect it

That defeats the purpose when the problem is "I don’t know where and what is going wrong."

## What changed

Added:

- [src/renderer/src/components/settings/DiagnosticsPanel.tsx](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/components/settings/DiagnosticsPanel.tsx)
- [src/renderer/src/components/settings/DiagnosticsPanel.module.css](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/components/settings/DiagnosticsPanel.module.css)

Updated:

- [src/renderer/src/App.tsx](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/App.tsx)
- [src/main/ipc.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/main/ipc.ts)
- [src/main/logger.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/main/logger.ts)

## UX decision

The app now exposes a `Diagnostics` action in the top navigation.

The diagnostics panel shows:

- recent log entries
- level
- scope
- timestamp
- structured metadata
- the exact local log-file path

## Reliability decision

Also added:

- renderer `error` capture
- renderer `unhandledrejection` capture
- main-process `uncaughtException` capture
- main-process `unhandledRejection` capture

This means both UI and backend failures have a much better chance of being visible in one place.

---

## 2026-04-10 — Added per-chat LLM exchange logging

## Problem

Generic runtime logging is still not enough when the real question is:

- what exactly did the model return?
- what prompt did we send?
- which operation produced the bad output?

Without that, failures around parsing or artifact generation are still partly opaque.

## What changed

Updated:

- [src/main/logger.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/main/logger.ts)
- [src/main/ipc.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/main/ipc.ts)
- [src/preload/index.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/preload/index.ts)
- [src/renderer/src/env.d.ts](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/env.d.ts)
- [src/renderer/src/App.tsx](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/App.tsx)
- [src/renderer/src/components/settings/DiagnosticsPanel.tsx](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/components/settings/DiagnosticsPanel.tsx)
- [src/renderer/src/components/settings/DiagnosticsPanel.module.css](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/src/renderer/src/components/settings/DiagnosticsPanel.module.css)

## What is now logged per LLM call

For each chat instance, the app now records:

- request id
- operation name
- model
- system prompt
- user prompt
- temperature
- max tokens
- response format
- raw model content on success
- structured error details on failure

These are written to:

- `.flows-memory/logs/llm.log`

## Diagnostics behavior

The diagnostics panel now shows:

- runtime logs
- LLM exchanges

This means you can inspect exactly what the model returned for:

- compression map generation
- branch expansion
- branch brief generation

## Design decision

LLM exchanges should be logged separately from generic runtime logs.

That keeps debugging cleaner:

- `app.log` answers "what failed in the app?"
- `llm.log` answers "what did the model say?"

---

## 2026-04-12 — Added local Ollama, concise node details, and Codex exec

## What changed

Flows now supports two model providers:

- Ollama local models through the local OpenAI-compatible endpoint at `http://localhost:11434/v1/chat/completions`
- OpenRouter hosted models through the existing API-key flow

The Settings panel now defaults to Ollama, keeps OpenRouter available, lets the user edit the Ollama base URL/model, and can refresh installed local Ollama models from `/api/tags`. Map generation, branch expansion, and branch-brief generation all pass provider/model settings through the main-process LLM call path.

Generated map nodes now preserve a concise display label separately from full context. Prompts now ask for headings in the form:

`Short Label :: Full context sentence`

The parser stores the short label in `title` and the full context in `description`. The canvas renders concise bubble labels by default, and hovering a node shows quick actions to view details or expand the branch. Viewing details turns the node into a larger square-ish box that uses the stored description, falling back to notes or the title for older maps.

Codex handoff now has two transports:

- clipboard handoff, preserving the existing behavior
- `codex exec`, which runs the local Codex CLI from the main process with `--full-auto`, `--sandbox workspace-write`, and the current workspace root

The Codex exec path stores command metadata, stdout/stderr/final-message output, exit code, and status on the execution handoff artifact.

## Implementation details

- Replaced the hard-coded OpenRouter-only call path with a provider-aware `callLLM` helper in main IPC.
- Added `AiProvider`, map `provider`, node `description`, and expanded Codex handoff transport/status metadata to shared contracts.
- Added an `ai:list-ollama-models` IPC endpoint and preload bridge.
- Updated memory persistence to carry map provider metadata.
- Fixed prompt loading to tolerate existing `prompts/...` call sites so the prompt files actually resolve under `resources/prompts`.
- Redacted API keys from the main error logging paths touched in this run.
- Kept Codex execution in the main process and used `spawn` with an args array instead of shell command interpolation.

## Product and UX decisions

- Ollama is the default provider so a user can generate maps without entering an API key.
- OpenRouter remains available as an explicit provider for hosted models.
- Concise node labels are the canonical canvas representation; full context lives in node details.
- Branch expansion remains attached to the node-level AI expand flow rather than becoming a separate global artifact.
- Direct Codex exec is additive. Clipboard handoff stays available as a fallback and lower-risk path.

## Deferred or kept lightweight

- Codex exec currently runs against the app workspace root and waits for the CLI process to finish before returning status. A future version should add a workspace chooser, streaming run logs, cancellation, and concurrency controls.
- The detail view is a canvas-level square detail state, not a separate artifact detail page.
- No automated UI/browser QA was added in this run.

## Verification

- Ran Prettier on touched files.
- Ran `npm run typecheck` successfully after implementation and formatting.

---

## 2026-04-12 — Warm monochrome UI redesign pass

## Problem

The primary Flows UI still felt like a generic dark AI dashboard: centered composition, Inter-based typography, blue/purple gradients, bright rainbow map branches, and scattered chrome that did not match the requested warm black-and-white direction.

The user explicitly asked for a better map UI using off-white and warm off-black instead of absolute white/black, with stronger typography, structure, cohesion, and light-mode support.

## What changed

Updated the active renderer UI layer:

- [src/renderer/src/globals.css](/Users/shaunakbhardwaj/Work/Maps/src/renderer/src/globals.css)
- [src/renderer/src/page.module.css](/Users/shaunakbhardwaj/Work/Maps/src/renderer/src/page.module.css)
- [src/renderer/src/App.tsx](/Users/shaunakbhardwaj/Work/Maps/src/renderer/src/App.tsx)
- [src/renderer/src/components/layout/CanvasOverlay.tsx](/Users/shaunakbhardwaj/Work/Maps/src/renderer/src/components/layout/CanvasOverlay.tsx)
- [src/renderer/src/components/layout/CanvasOverlay.module.css](/Users/shaunakbhardwaj/Work/Maps/src/renderer/src/components/layout/CanvasOverlay.module.css)
- [src/renderer/src/components/mindmap/MindmapCanvas.tsx](/Users/shaunakbhardwaj/Work/Maps/src/renderer/src/components/mindmap/MindmapCanvas.tsx)
- [src/renderer/src/components/mindmap/MindmapCanvas.module.css](/Users/shaunakbhardwaj/Work/Maps/src/renderer/src/components/mindmap/MindmapCanvas.module.css)

## Design decisions

- Replaced the old dark slate/purple-blue visual language with warm monochrome design tokens.
- Added a proper light-mode token set using off-white surfaces and warm charcoal text instead of pure white or pure black.
- Switched typography away from Inter to an Outfit + JetBrains Mono pairing for a more deliberate product UI.
- Reworked the landing workspace into a two-column composition: creation controls on one side and a compact workflow/map preview on the other.
- Kept the interface primarily black-and-white, with only muted warm/desaturated map branch colors so the canvas remains readable.
- Rebuilt the overlay chrome and canvas styling around the same warm neutral tokens.
- Removed emoji from the canvas overlay footer and replaced the note marker emoji in the D3 canvas with a text marker.
- Kept borders/radii restrained at 8px or below for the redesigned surface.

## Deferred or kept lightweight

- This pass focused on the primary workspace, overlay, and map canvas. Some secondary panels such as Settings, Diagnostics, context menus, and AI expand dialogs still inherit the new theme variables but have not had a full bespoke layout pass.
- No new frontend dependencies were added; the redesign stays CSS/D3-based rather than introducing a new icon or animation package.
- No browser screenshot QA was run because this is an Electron renderer rather than a simple web page, but the renderer was compiled through the production build.

## Verification

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Ran `npm run lint`, but it is blocked before code analysis because ESLint 9 cannot find an `eslint.config.*` file in the repo.

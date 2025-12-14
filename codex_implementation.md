# Constellations — Codex Implementation Plan

This is an opinionated, execution-oriented plan that prioritizes correctness, data integrity, and maintainability before larger feature work (multi-model + providers).

## Goals

- Eliminate known correctness bugs and type drift.
- Protect user data from partial/failed ingestion runs.
- Make main-process and IPC code easier to change safely.
- Improve UX feedback for long-running operations.
- Provide a clear, testable path to multi-model embeddings and provider support.

## Non-goals (for early milestones)

- Building full “LLM/RAG synthesis” features (keep hooks only).
- Over-optimizing performance before integrity and observability exist.
- Large UI redesign.

## Guiding principles

- Prefer small, reversible refactors with tight acceptance criteria.
- Establish invariants (data + IPC contracts) before adding concurrency.
- Treat embeddings as derived data: rebuildable, versioned, garbage-collectable.
- Keep secrets out of renderer; never log secrets.
- Use repo-relative references in docs (portable across machines/CI).

## Invariants to enforce

- **Single source of truth for types**: shared types live in `src/shared/types.ts` (no local redefinitions).
- **Ingestion is atomic (SQLite)**: a file never ends in a limbo state (“processing forever”) due to partial DB writes.
- **Embedding identity is explicit**: every embedding row has `file_id`, `chunk_id`, and `embedding_model_id` (or table per model), and search results return a human-readable `relative_path`.
- **Deletion is complete**: deleting a file removes SQLite rows and associated LanceDB vectors (or marks for cleanup with a reliable reconciler).
- **Concurrency is centralized**: watcher, scanner, and manual import all funnel into the same ingestion queue with bounded concurrency.

---

## Milestone 1 — Correctness + crash containment (P0)

### 1.1 Deduplicate shared types

**Work**
- Remove duplicate type definitions from `src/preload/index.ts` and `src/renderer/src/App.tsx`.
- Import types from `src/shared/types.ts`.

**Acceptance criteria**
- `tsc` passes with no type drift or duplicate definitions.
- IPC payload types are imported, not redefined.

**Likely files**
- `src/shared/types.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`

### 1.2 Fix search result filename bug

**Work**
- Ensure search results return `relative_path` (or a display filename derived from it), not `file_id`.
- Recommended: after LanceDB hits, query SQLite for `relative_path` by `file_id` (simple and correct).

**Acceptance criteria**
- Search UI displays readable file names/paths.
- Works for files imported previously (no re-index required just to show names).

**Likely files**
- `src/main/search.ts`
- `src/main/db/sqlite.ts` (if helper query added)

### 1.3 Add React error boundary at app root

**Work**
- Add `ErrorBoundary` component and wrap `<App />` in `src/renderer/src/main.tsx`.
- Optionally isolate Three.js canvas in its own boundary if it’s a frequent failure source.

**Acceptance criteria**
- A thrown error renders a recovery UI (“Reload”) instead of a blank screen.
- Errors are logged (console and/or main-process logger if available).

**Likely files**
- `src/renderer/src/main.tsx`
- `src/renderer/src/components/ErrorBoundary.tsx`

---

## Milestone 2 — Data integrity (should be treated as P0/P1)

### 2.1 Transaction safety in ingestion (SQLite)

**Work**
- Wrap “delete old chunks → insert new chunks → update file status” in a single SQLite transaction.
- Ensure failures always end with a consistent file status (e.g., `failed` with error detail; or revert to `indexed` if keeping old chunks).
- Treat LanceDB writes as a second phase; never delete old vectors until new vectors are confirmed.

**Acceptance criteria**
- Inducing an embedding failure mid-run does not corrupt SQLite state.
- No file remains stuck in `processing` after failures.
- Old vectors remain usable until replacements are safely committed.

**Likely files**
- `src/main/ingestion/index.ts`

### 2.2 Complete deletion (SQLite + LanceDB)

**Work**
- When a file is deleted, remove both:
  - SQLite rows (`files`, `chunks`, etc.)
  - LanceDB vectors for that `file_id` (+ `embedding_model_id` if applicable)
- Add a periodic reconciler (optional early) that can detect and clean orphans safely.

**Acceptance criteria**
- Deleting a file cannot leave stale search hits.
- A failed LanceDB delete does not silently succeed; it’s retried or queued for cleanup.

**Likely files**
- `src/main/watcher.ts`
- `src/main/db/lance.ts` (helper delete APIs)

---

## Milestone 3 — Maintainable main-process boundaries

### 3.1 Modularize IPC registration

**Work**
- Split `src/main/index.ts` into IPC handler modules (files/brain/search/secrets/etc.) and a single registration entrypoint.
- Keep handler modules thin: parse args, call services, return typed results.

**Acceptance criteria**
- `src/main/index.ts` focuses on app/window lifecycle + calling `registerAllHandlers`.
- IPC handlers are testable as pure functions/services where possible.

**Likely files**
- `src/main/index.ts`
- `src/main/ipc/index.ts`
- `src/main/ipc/handlers/*.ts`

### 3.2 Configuration system (main-process owned)

**Work**
- Define a config schema with defaults and validation.
- Choose a location strategy per OS (e.g., `app.getPath('userData')`-scoped JSON).
- Provide read-only IPC for most settings; write IPC only for settings that must be user-editable.

**Acceptance criteria**
- No hardcoded brain path/chunk/batch settings in ingestion/scanner/watcher.
- Invalid configs fail safely (defaults + clear error).

**Likely files**
- `src/main/config/*`
- `src/main/ingestion/*`, `src/main/scanner.ts`, `src/main/watcher.ts`
- `src/preload/index.ts` (config API surface)

---

## Milestone 4 — UX feedback + safe concurrency

### 4.1 Indexing progress events

**Work**
- Add an `indexing-progress` event stream from main → renderer.
- Emit “started/progress/completed/failed” with `file_id` + `relative_path` and chunk counts where available.

**Acceptance criteria**
- Large ingestions show visible progress and completion/failure feedback.
- Renderer can show per-file indexing state.

**Likely files**
- `src/main/ingestion/index.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`

### 4.2 Central ingestion queue + bounded concurrency

**Work**
- Introduce a single queue/worker (concurrency 2–5) used by:
  - initial scan
  - watcher events
  - manual import
- Use backpressure and dedupe per path/file_id to avoid redundant work.

**Acceptance criteria**
- Concurrency does not cause DB locks, out-of-memory, or rate-limit storms.
- Scanner no longer `await`s a sequential loop, but still respects global concurrency limits.

**Likely files**
- `src/main/scanner.ts`
- `src/main/watcher.ts`
- `src/main/ingestion/*` (queue entrypoints)

### 4.3 Search debouncing

**Work**
- Debounce search input; show “searching…” state.

**Acceptance criteria**
- Repeated keystrokes do not spam IPC or embedding search.

**Likely files**
- `src/renderer/src/App.tsx`

---

## Milestone 5 — Model management system (major feature)

This milestone should start only once Milestones 1–4 are stable.

### 5.1 Model catalog + types

**Work**
- JSON catalog for embedding models (local + OpenRouter), with typed accessors.
- Define `EmbeddingModelInfo`/`LLMModelInfo` and provider types in `src/shared/types.ts`.

**Acceptance criteria**
- Catalog loads at startup; invalid entries are rejected with clear errors.

### 5.2 Provider interface + storage strategy

**Work**
- Implement `EmbeddingProvider` interface for local and OpenRouter.
- Pick a storage strategy and document it:
  - **Recommended**: one LanceDB table per embedding model ID (simplest dimension safety).
  - Alternative: single table with `model_id` partitioning (requires strict dimension checks).

**Acceptance criteria**
- Switching active embedding model is explicit and persisted.
- Search uses the active model’s table/data and cannot mix dimensions.

### 5.3 Migration story for existing users

**Work**
- On upgrade, mark existing embeddings as belonging to the “default model id”.
- Add an “Embeddings cleanup / reindex” flow to delete old model tables safely.

**Acceptance criteria**
- Existing users keep working immediately after upgrade (no forced reindex).
- Reindex flow is cancellable and reports progress.

### 5.4 Secrets + API keys

**Work**
- Store secrets using OS facilities where possible.
  - If using Electron `safeStorage`, handle `safeStorage.isEncryptionAvailable() === false` with an explicit UX + fallback policy.
  - If true OS keychain is required, use a dedicated keychain library and keep the renderer out of the loop.

**Acceptance criteria**
- Renderer never receives plaintext keys.
- Keys are never logged; validation is done in main process.

---

## Testing and verification strategy (incremental)

- **Type + build checks**: `tsc` must pass after each milestone.
- **Failure injection** (Milestone 2): simulate embedding failures to validate rollback behavior.
- **Manual flows**: import → index → search → delete → confirm search doesn’t return deleted files.
- **Add unit tests only where they reduce risk**:
  - splitter chunk metadata (if implemented)
  - ingestion transaction behavior (service-level tests)
  - any pure helpers (path safety, uniqueness, queue dedupe)

---

## Risk register (what to watch)

- **SQLite + concurrency**: DB locks and partial updates if queueing isn’t centralized.
- **LanceDB consistency**: deletes/updates can drift without reconciliation or careful ordering.
- **Cross-platform storage**: config + secrets location differs across macOS/Windows/Linux.
- **Provider heterogeneity**: model dimensions, rate limits, and batching differ; enforce provider contracts early.


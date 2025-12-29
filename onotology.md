# Ontology (Knowledge Graph) Implementation Plan

This repo currently has:
- A schema migration for `entities` and `relationships` (`src/main/db/migrations/004_ontology.sql`).
- Types and extraction prompts (`src/main/ontology/types.ts`, `src/main/ontology/prompts.ts`).
- Empty ontology modules (`src/main/ontology/extraction.ts`, `src/main/ontology/store.ts`, `src/main/ontology/retrieve.ts`, `src/main/ontology/index.ts`).
- An “ontology” experiment mode that is simulated (no graph extraction/storage/traversal) (`src/main/ipc/handlers/experiment.ts`).

This document is a detailed plan to implement a real, persisted knowledge graph (KG) with graph traversal, integrated into ingestion and query-time retrieval.

---

## Goals

1. **Persist a real KG** built from ingested documents: entities + relationships + evidence.
2. **Enable graph traversal** to expand context beyond embedding-only chunk retrieval.
3. **Ground every edge in evidence** (chunk IDs and excerpts) to reduce hallucinations.
4. **Incremental, maintainable ingestion**: re-indexing a file updates the KG cleanly.
5. **Practical UX**: show “how the answer was derived” (paths + citations).

Non-goals (initially):
- Perfect entity resolution across all alias variants.
- Full-blown graph analytics (community detection, centrality, etc.).
- A fancy interactive 3D graph UI (can come later).

---

## High-Level Architecture

### Data flow

**Ingestion time**
1. File → text extraction → chunking (already exists in `src/main/ingestion/index.ts`).
2. For each chunk: run an **ontology extractor** (LLM or local model) → produce `ExtractionResult`.
3. Store/merge entities + relationships into SQLite KG tables.
4. Store evidence links (chunk IDs, optional excerpt spans).

**Query time**
1. User query → embedding search over chunks (already exists via LanceDB in `src/main/search.ts`).
2. Use top chunks as **seeds** to retrieve mentioned entities.
3. Traverse the KG from those seeds (BFS/beam search) to collect related entities/edges.
4. Pull evidence chunks for collected edges.
5. Generate a grounded answer from: (a) original top chunks + (b) KG-derived evidence.

### Key design principle

**The KG should not be “whatever the answer LLM says.”** The KG is a separate artifact produced by a constrained extraction step and stored with provenance.

---

## Phase 0 — Decide Scope and Interfaces (1–2 days)

### Decisions
- **Extractor model** for ontology extraction:
  - Option A: OpenRouter (networked chat model).
  - Option B: local small instruct model (requires new integration; embeddings-only is not enough).
- **Where to store KG**: use the existing SQLite database (recommended for v1).
- **When to extract**: on every chunk during ingestion (recommended v1), or on-demand.

### Interfaces to define (in `src/main/ontology/*`)
- `extractFromChunk(chunk: OntologyChunk): Promise<ExtractionResult>`
- `upsertExtraction(fileId, chunkId, extractionResult): Promise<void>`
- `traverse(query, seedChunkIds, options): Promise<OntologySearchResult[]>`

Keep these interfaces stable; implementation can evolve.

---

## Phase 1 — Fix the Storage Model (Schema) (2–4 days)

`004_ontology.sql` stores `source_chunk_ids` and `evidence_chunk_ids` as TEXT fields. That works for a demo, but it becomes painful for:
- re-indexing a single file,
- deleting a file and cleaning references,
- querying “which chunks mention this entity?” efficiently.

### Recommended schema additions (new migration `005_ontology_evidence.sql`)

Add join tables instead of comma-delimited strings:

1. `entity_mentions`
   - `entity_id` (FK → `entities.id`)
   - `chunk_id` (FK → `chunks.id`)
   - `file_id` (FK → `files.id`) for fast delete-by-file
   - `created_at`
   - Unique constraint: `(entity_id, chunk_id)`
   - Indexes: `(entity_id)`, `(chunk_id)`, `(file_id)`

2. `relationship_evidence`
   - `relationship_id` (FK → `relationships.id`)
   - `chunk_id` (FK → `chunks.id`)
   - `created_at`
   - Unique constraint: `(relationship_id, chunk_id)`
   - Indexes: `(relationship_id)`, `(chunk_id)`

3. Optional but recommended: `entity_aliases`
   - `entity_id`
   - `alias_normalized`
   - `alias_display`
   - Helps merge “Mike Rodriguez” with “Michael Rodriguez” later.

### Backward compatibility
- Keep the existing `entities.source_chunk_ids` and `relationships.evidence_chunk_ids` columns for now (to avoid breaking anything), but treat them as legacy and stop relying on them in new code.

### Delete/reindex safety
- When a file is reprocessed, delete its chunk rows and Lance vectors already happens.
- Add deletes for `entity_mentions` and `relationship_evidence` rows for that `file_id` and affected `chunk_id`s, then reinsert from fresh extraction.
- Consider garbage collecting orphaned entities/relationships (optional v1; can be periodic).

---

## Phase 2 — Implement Ontology Extraction (LLM → JSON) (3–7 days)

### Extraction behavior
Input: one chunk (`chunks.text`) plus minimal metadata (chunk id, file id).
Output: `ExtractionResult` with:
- canonical entity names
- constrained entity types (`EntityType` in `src/main/ontology/types.ts`)
- constrained relationship types (`RelationshipType` in `src/main/ontology/types.ts`)
- `evidence` strings that are direct quotes or short spans from the chunk

### Prompting strategy
Use:
- `ONTOLOGY_SYSTEM_PROMPT` (`src/main/ontology/prompts.ts`)
- `buildExtractionPrompt(text)` for the user content

Add strictness:
- Force pure JSON output (no markdown, no prose).
- Explicitly forbid creating entities not present in text.
- Require that `evidence` is a literal substring of the chunk (best-effort; validate).

### Output validation rules
Implement a validator that:
- drops entities/relationships with invalid types,
- clamps confidence to `[0, 1]`,
- rejects relationships where `source/target` are missing/empty,
- optionally rejects edges whose `evidence` is not found in the chunk text.

### Model choices
**OpenRouter path (fastest to implement in this repo):**
- Reuse `OpenRouterClient.chat` (`src/main/llm/openrouter.ts`) with a dedicated extraction model selection (configurable).

**Local model path (more work, but offline):**
- Requires adding a local *text generation* backend (Ollama / llama.cpp / etc.) and a client wrapper.
- Embedding models via `@xenova/transformers` are not sufficient for structured extraction.

### Error handling
- Retry extraction 1–2 times on parse failure with a “repair JSON” prompt.
- If still failing, store nothing for that chunk and log an error (do not block the entire ingestion).

---

## Phase 3 — Implement KG Persistence (Upsert + Evidence) (3–6 days)

### Entity canonicalization & normalization
Implement a deterministic normalizer for `canonical_name_normalized`:
- trim, lowercase
- collapse whitespace
- remove surrounding punctuation
- optionally strip honorifics (“Dr.”) for normalized form

### Upserting entities
For each extracted entity:
- compute normalized name
- if exists: merge type assignments, increment `mention_count`, update `last_seen_at`
- else: insert new entity id

Also insert `entity_mentions(entity_id, chunk_id, file_id)`.

### Upserting relationships
For each relationship:
- resolve `source_entity_id`/`target_entity_id` via normalized names (creating entities if needed)
- upsert into `relationships` using the unique `(source_entity_id, target_entity_id, type)`
- insert `relationship_evidence(relationship_id, chunk_id)`

### Notes on confidence
- Store `relationships.confidence` as a stable value:
  - Use `max(existing, new)` or a weighted average.
  - Track provenance by counting evidence rows rather than overfitting confidence.

---

## Phase 4 — Integrate Extraction into Ingestion (Incremental KG Build) (2–5 days)

### Hook point
In ingestion, after chunk rows are created/inserted (already in `src/main/ingestion/index.ts`), run ontology extraction for those chunks and store results.

Key requirement: the KG needs **stable chunk IDs** to reference. Today, chunk IDs are generated during insertion. Ensure extraction/storage happens after chunk IDs exist (or generate IDs earlier and reuse them consistently).

### Concurrency model
Avoid blocking the UI/main thread:
- Option A: perform extraction sequentially per file with progress events.
- Option B: run extraction in a worker thread (similar to embeddings worker) with bounded concurrency.

Start with Option A for simplicity, then optimize.

### Config flags
Add config toggles (so KG can be disabled/enabled):
- `ontology.enabled: boolean`
- `ontology.extractor: 'openrouter' | 'local'`
- `ontology.model: string` (if OpenRouter)
- `ontology.maxChunksPerFile?: number` (for cost control)

---

## Phase 5 — Implement Graph Traversal Retrieval (3–7 days)

### Seeding strategy (important)
We need a reliable way to find “starting entities” for traversal.

Recommended v1 approach:
1. Run embedding search for top-k chunks (existing).
2. Collect `chunk_id`s from results.
3. Query `entity_mentions` for entities mentioned in those chunks.
4. Use those entities as seeds.

Optional enhancements:
- Name-based entity search: if the query contains “Sarah Chen”, match `entities.canonical_name_normalized`.
- Hybrid scoring combining embedding relevance + entity mention frequency.

### Traversal algorithm (v1)
Use constrained BFS / beam search:
- depth 1–2 (start small)
- allowed relationship types (configurable per query mode)
- cap max edges expanded per node (e.g., 10)
- rank edges by: relationship confidence + evidence count + recency + seed relevance

Return:
- a set of relevant edges (triples)
- supporting chunk evidence for each edge (via `relationship_evidence`)
- optionally paths (entity sequence) for UI display

### Retrieval output format
Return a structured “ontology context pack” to feed into the answer model:
- `Triples`: `[source] -[type]-> [target] (confidence, evidenceChunkIds)`
- `Evidence snippets`: chunk texts for those evidenceChunkIds (with file name + chunk index)

This is what makes the final answer grounded.

---

## Phase 6 — Answer Generation (Grounded, with Citations) (2–5 days)

### Prompting
Create a dedicated answer prompt for KG-backed QA:
- “Use only the provided evidence.”
- “If evidence does not support a claim, say you don’t know.”
- “Cite sources by file + chunk index (or chunk id) for each person listed.”

### Compose final context
Combine:
- Top embedding chunks (for raw text context)
- KG evidence chunks (for relational context)
- Triples summary (for structured guidance)

### Output shape
For queries like “List everyone Sarah Chen has worked with”:
- return the list of persons + relationship type + evidence citation
- optionally include a “graph view” as a list of edges

This prevents the “missing people” issue you saw earlier by making the system enumerate all graph neighbors for the subject entity.

---

## Phase 7 — Wire Into the App (Experiment + Main Search) (2–6 days)

### Experiment panel
Replace the simulated ontology path in `src/main/ipc/handlers/experiment.ts` with:
- extract/store step (either on `experiment-process-docs` or precomputed)
- traverse step on `experiment-query`

Note: the Experiment panel currently processes docs in-memory; a real KG wants persistence. Options:
- Option A (recommended): reuse the real DB and treat experiment docs as real ingested files.
- Option B: keep a separate in-memory KG implementation for experiments (more work; not recommended).

### Main app
Add a “Use Ontology” toggle for normal queries (parallel to experiment).
Route:
1) RAG-only path (existing)
2) RAG + ontology traversal path (new)

---

## Phase 8 — Testing & Evaluation (2–6 days)

### Unit tests (Vitest)
Add tests for:
- normalization/canonicalization
- upsert behavior (entity merge, relationship de-dupe)
- traversal constraints (depth/limits)

### Golden tests with fixtures
Use small fixture docs (like `test-docs/`) and assert:
- the KG contains expected edges
- the “worked with” query returns all named collaborators with citations

### Extraction determinism
LLM extraction is stochastic. To test:
- mock the extractor (feed known JSON) for most tests
- keep one optional integration test behind a flag (requires network/OpenRouter)

---

## Phase 9 — Performance, Cost, and Reliability (ongoing)

### Performance considerations
- Extraction cost scales with number of chunks; add limits and batching.
- Store operations should be transaction-wrapped per file.
- Add indexes on normalized names and relationship type columns (some exist already).

### Incremental rebuild
Implement “ontology rebuild” operations:
- rebuild for one file
- rebuild entire brain (background job + progress)

### Observability
Log:
- extraction latency, parse failure rates
- entity/edge counts per file
- traversal sizes per query

---

## Suggested Implementation Order (Concrete Checklist)

1. Add schema migration for evidence join tables.
2. Implement entity normalization + upsert store logic.
3. Implement extractor client (OpenRouter first), strict JSON parsing/validation.
4. Integrate extraction into ingestion (per chunk, stored in DB).
5. Implement retrieval: seed from top-k chunks → traverse relationships → collect evidence.
6. Replace simulated ontology in experiment handler with real traversal results.
7. Add tests + fixture-based evaluation for “worked with” style queries.
8. Add UX: show traversed paths + citations in the UI.

---

## Open Questions (Need Your Input)

1. Should KG extraction run **by default** on ingestion, or only when “ontology mode” is enabled?
2. Do you want extraction via **OpenRouter** (higher quality, network) or **local** (offline, more setup)?
3. What relationship types do you want beyond the current list (`works_with`, `reports_to`, etc.) (`src/main/ontology/types.ts`)?
4. Do you want ontology to be **person-centric** first (best for your use case), or generic across all entity types?


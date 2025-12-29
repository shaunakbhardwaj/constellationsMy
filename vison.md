# Vision: “Palantir-like” Ontology Layer for Constellations

This doc expands the capabilities mentioned earlier (connectors, entity resolution, governance, workflows, etc.) into a product/technical vision and an incremental roadmap for this codebase.

It assumes the near-term plan in `onotology.md` (build a real KG + traversal) is the foundation, not the end state.

---

## North Star

Constellations should become a **trustworthy semantic operating layer** over your personal/company “brain”:
- A **typed object graph** (Ontology) that represents people, projects, documents, systems, and concepts.
- **Evidence-backed facts** that can be audited (“why do we believe this?”).
- **Governed access** (who can see what, and why).
- **Operational workflows** (review, approve, act) built directly on the ontology.

Search/Q&A becomes a feature of this layer, not the core product.

---

## Core Concepts (What We Mean by “Ontology”)

### 1) Objects (typed entities)
Examples: `Person`, `Project`, `Organization`, `System`, `Customer`, `Policy`, `Metric`, `Incident`.

Each object should have:
- a stable ID
- a canonical name + aliases
- a schema (attributes with types)
- provenance (sources and timestamps)

### 2) Relationships (typed edges)
Examples: `works_with`, `reports_to`, `owns`, `approved_by`, `depends_on`, `implemented_by`.

Each relationship should have:
- directionality (source → target)
- confidence/strength (optional)
- evidence references (document chunks, structured sources)
- optional validity window (effective dates)

### 3) Provenance / evidence
Every derived claim should trace back to:
- source document(s) and chunk(s), and/or
- structured system-of-record facts (HRIS, Jira, Git, etc.)

Provenance is how you avoid “pretty answers with no grounding”.

---

## What You’re Building vs “Graph RAG”

### Ontology-backed Knowledge Graph
The persisted graph (objects + relationships + evidence) is the durable asset.

### Graph RAG
A retrieval technique that uses the graph at query time:
- embed query → retrieve seed chunks/entities → traverse graph → retrieve evidence → answer

**In the long run**, the graph powers more than Q&A: dashboards, workflows, alerts, reporting, and apps.

---

## Expanded Capabilities (Palantir-like Features) and What They Mean Here

### A) Data connectors + normalization
**Goal:** ingest from many sources into one coherent ontology.

What this means in Constellations:
- File connectors: local folders, PDFs, Google Drive/Docs, Notion, Confluence.
- System connectors: Jira/Linear, GitHub, Slack, calendar, CRM.
- A normalization pipeline:
  - fetch → parse → transform into canonical object/edge records → store + index

Key design choice:
- Treat “documents” as one data source among many, not the only one.

Deliverables:
- Connector interfaces + per-source adapters
- Source metadata (source type, timestamps, permissions, external IDs)
- Ingestion “jobs” with retry, backoff, progress, and audit logs

---

### B) Entity resolution (canonical IDs, aliasing, de-dup)
**Goal:** “Sarah Chen” from a PDF and “S. Chen” from Slack are the same object.

What it entails:
- Exact-match normalization: case/whitespace/punctuation.
- Alias table: known alternative names.
- Similarity matching: embedding or string distance + human confirmation.
- Merge workflow: propose merges, record decisions, keep history.

Why it matters:
- Without entity resolution, the graph fragments and traversal becomes noisy.

Deliverables:
- Alias management + merge UI
- Merge rules and conflict resolution for attributes
- Merge-safe evidence retention (don’t lose provenance)

---

### C) Ontology management (schema evolution + constraints)
**Goal:** the ontology is a first-class model, not an ad-hoc list of strings.

What it entails:
- Schema registry:
  - object types, attribute definitions, relationship definitions
  - constraints (required fields, cardinality, allowed edge types)
- Versioning:
  - migrate from schema v1 → v2 without breaking old data
- Validation:
  - reject or quarantine invalid extractions/records

Deliverables:
- Ontology definition files (JSON/TS/YAML) + migrations
- Admin UI to edit types/attributes/relationships (optional early)
- Validation reports (“these edges violate constraints”)

---

### D) Governance + permissions (fine-grained access control)
**Goal:** different users/roles see different parts of the graph.

What it entails:
- Permissions on:
  - source documents/chunks
  - derived entities/relationships (inherit from evidence)
  - objects/edges imported from systems (per-system ACLs)
- Audit trails:
  - who accessed what
  - who approved changes
  - who merged entities

Deliverables:
- Permission model + enforcement at query time
- “Explain why you can see this” UI
- Audit logs and retention policy

---

### E) Provenance, lineage, and explainability
**Goal:** every node and edge is explainable and traceable.

What it entails:
- Evidence links:
  - for each edge: list of chunk IDs + excerpt spans
- Lineage:
  - derived facts should reference upstream facts
- Confidence model:
  - “extracted from text” vs “system-of-record” vs “human-verified”

Deliverables:
- “Show evidence” UI for edges and objects
- Confidence and verification status on objects/edges
- Exportable audit report for any claim

---

### F) Human-in-the-loop curation (review and approve)
**Goal:** make the graph correct over time, not just generated.

What it entails:
- Proposed extractions (staging area) vs published graph
- Review queues:
  - new entities, new edges, low-confidence changes, conflicts
- Approval workflows:
  - accept/reject/edit edges and attributes
- Feedback loops:
  - improve extraction prompts/models based on corrections

Deliverables:
- Moderation UI
- Change log + rollback
- “Verified” badge semantics

---

### G) Workflows and operational apps built on the ontology
**Goal:** turn knowledge into action.

Examples:
- “Onboarding workflow”: new customer object triggers tasks, owners, SLAs.
- “Incident workflow”: link incident → systems → owners → runbooks.
- “OKR tracking”: link goals → projects → metrics → owners.

Deliverables:
- Event model: changes in the ontology produce events
- Automation rules (“when edge X appears, do Y”)
- App surfaces: dashboards, task lists, notifications

---

### H) Query + analytics layer (beyond chat)
**Goal:** reliable questions, reports, and joins over the ontology.

What it entails:
- Graph queries:
  - “neighbors of Sarah within 2 hops by works_with/reports_to”
  - “projects at risk with dependencies on system X”
- Aggregations:
  - counts, timelines, centrality, bottlenecks

Deliverables:
- A query API that returns structured results (not just LLM text)
- Saved queries + dashboards
- Export to CSV/JSON

---

## Suggested Product Milestones (Incremental Roadmap)

### Milestone 1: Real KG + Graph RAG (MVP)
Outcome:
- Persisted entities/edges with evidence
- Traversal-based retrieval improves completeness (e.g., “worked with” queries)
- Citations for each listed relationship

This is the “foundation milestone” described in `onotology.md`.

---

### Milestone 2: Entity Resolution + Evidence UI
Outcome:
- fewer duplicates, more stable object IDs
- users can inspect/approve merges and edges
- “why” is visible everywhere

---

### Milestone 3: Ontology Schema + Validation
Outcome:
- you can evolve the ontology safely (new types, attributes, relationships)
- extractors are constrained by the schema and checked post-hoc

---

### Milestone 4: Connectors for Systems-of-Record
Outcome:
- combine documents with Jira/Git/Slack facts
- treat “truth sources” as authoritative where possible

---

### Milestone 5: Governance + Multi-user
Outcome:
- permissioned graph views
- audit logs, data retention, role-based access

---

### Milestone 6: Workflows and Apps
Outcome:
- ontology becomes operational (actions, tasks, alerts)

---

## Architectural Guardrails (to avoid dead ends)

1. **Evidence-first:** never let the answer model create “facts” that aren’t in evidence.
2. **Stable IDs:** every object/edge must be addressable; names are not IDs.
3. **Separation of concerns:** extraction != storage != retrieval != generation.
4. **Deterministic core:** traversal and query results should be reproducible.
5. **Human correction loop:** correctness improves via review, not only model choice.

---

## Key Risks and Mitigations

- **Hallucinated edges** → strict extraction schema + evidence substring checks + review queue.
- **Graph explosion/noise** → depth limits, type filters, edge ranking, and “verified” preference.
- **Cost and latency** → batch extraction, caching, incremental updates, optional local models.
- **Duplicate entities** → entity resolution + merge tooling early.
- **Trust gap** → show evidence everywhere; allow export/audit.

---

## How This Maps to the Current Codebase (Reality Check)

Today:
- Embedding retrieval exists and is useful as the seeding mechanism.
- The “ontology experiment” is currently simulated and should be replaced with real graph retrieval.
- SQLite already stores file/chunk metadata; extending it to store evidence join tables is natural.

Near-term:
- Implement the KG foundation (Milestone 1), then immediately add curation + entity resolution (Milestone 2) to prevent the graph from degrading.


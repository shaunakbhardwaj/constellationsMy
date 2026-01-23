# Product Vision: AI-First Visual Thinking

## Core Philosophy
**Visuals > Text.**
The goal is to shift from consuming long-form LLM output to building **persistent visual structures** that can be inspected, edited, and re-used (maps → paths → flows → artifacts).

- **For Humans**
  - **See the thinking**: understand complexity through structure, not paragraphs.
  - **Stay oriented**: maps are navigable, revisitable, and shareable.
  - **Edit with intent**: change meaning and structure, not pixels.
- **For Agents**
  - **Produce structure**: generate visual/semantic data that renders into diagrams.
  - **Consume structure**: treat diagrams as executable instructions and constraints.

**Local-first MVP.** Everything happens on-device (no cloud). Text input only for MVP (no voice).

## One Unified Interface (No Modes)
Brainstorm and Flow are not separate products. They are **successive states** of a single canvas:

1. **Diverge (Idea Map)**: generate many options quickly, branch wide, explore.
2. **Commit (Path Selection)**: choose what matters, remove noise, form a narrative.
3. **Converge (Execution Flow)**: translate the selected path into steps, decisions, and outputs.

The interface should make this progression feel effortless: **widespread → selected → executable**.

## Interaction Model: Select → Generate Flow
The most important interaction in the product is turning messy ideation into a precise execution plan.

### 1. Idea Map (widespread)
- Fast branching and expansion.
- Lightweight semantics (ideas, options, questions).
- Optional loose clustering/ordering, but structure remains the source of truth.

### 2. Path Selection (commit)
Users can **tag/select** nodes that matter (like selecting sizes in an e-commerce app):
- Multi-select nodes across branches.
- Selected nodes become visually “active”; everything else fades/greys out.
- The UI shows a “Selected Path” tray (ordered list) that can be re-ordered.
- Selection supports “include children” and “exclude sub-branch” actions for fast pruning.

### 3. Generate Flow (converge)
From a selection, the user clicks **Generate Flow**:
- The agent translates the selection into a directional execution flow (process + decision points).
- The agent proposes missing steps, preconditions, and outputs.
- The user reviews and edits the flow (rename steps, change node type, label decision edges).

This is the core “why it beats voice”: the output is **inspectable, replayable, and editable**.

## Visual Language (Semantic Rendering)
We keep one canvas, but nodes and edges render based on **semantic meaning**, not “mode”.

### Node Types (Execution Semantics)
Nodes render differently based on their role (set by metadata or syntax):
- **Rectangle (Process)**: “Do this”, “Action item”, “State”.
- **Diamond (Decision)**: “Evaluate condition”, “Branch logic”.
- **Circle/Oval (Start/End)**: “Entry point”, “Exit point”.
- **Parallelogram (Input/Output)**: “Read data”, “Write data”.
- **Ghost/Draft**: “Low confidence”, “Alternative path”, “Needs validation”.

### Edges (Flow Semantics)
- **Arrowheads** are mandatory for execution flows.
- **Edge labels** are first-class (e.g., “Yes/No”, “Default”, “Blocked by”).
- **Line styles** convey certainty/strength (solid vs dashed).

### Colors (Meaningful, Not Decorative)
- Colors convey semantics (e.g., happy path vs risk vs system action), with conservative defaults.
- Selection state is always obvious (selected = crisp; unselected = dimmed).

## Constraints (Keep It Agent-Readable)
To preserve agent usefulness and avoid “drawing app chaos”:
- **No free drawing** of arbitrary shapes/lines.
- **Structure-first editing**: add sibling/child, change type, label edges; layout is automated.
- **Contextual menus**: change semantics via a menu, not toolbars.
- **No pixel pushing**: users edit meaning, the layout engine handles placement.

## Data Representation (Agent Interface)
The source of truth is a portable structure (Markdown/JSON) that can store execution semantics.

### Metadata Extensibility (Markdown-friendly)
```markdown
# Launch idea {type: root}
## Identify ICP {type: idea}
## Pick distribution channel {type: decision}
### [If SEO] Write 10 pages {type: process}
### [If Ads] Test 3 creatives {type: process}
## Output: CSV of experiments {type: output}
```

### Selection as a First-Class Concept
Selection is not just UI state; it’s a semantic operation:
- Store selection sets (“Path A”, “Path B”) so users can compare alternatives.
- Store a generated flow as a derived artifact of a selection (with a stable link back).

## Memory (Local-First)
“Memory” in Flows is not a chat transcript. It’s a **library of structured thinking**.

### What We Remember
- Mindmaps + execution flows (tree/graph + metadata).
- Selections (“paths”) and derived flows.
- Notes, decisions, and rationale attached to nodes.
- Generated artifacts in a contained workspace folder (specs, CSVs, files).

### MVP Storage Approach (Recommended)
Start simple and local:
- **SQLite** for metadata + history (fast, reliable, easy to ship with Electron).
- Store mindmap/flow structures as JSON blobs + indexes for titles/timestamps/tags.
- Add semantic search later via embeddings.

### Vector DB Options (When We Add Semantic Search)
All of these can run locally; choose based on packaging and simplicity:
- **LanceDB**: great local-first vector store (Arrow/Parquet), good for embedded desktop.
- **Chroma**: easy developer experience for local prototyping.
- **SQLite + vector extension** (e.g., sqlite-vss): fewer moving parts if you want “one DB”.

## MVP Scope: From Idea → Flow → Artifacts
The MVP proves the loop end-to-end:

1. Generate a wide idea map from a prompt.
2. Let users select/tag the nodes that represent the path they want.
3. Generate an execution flow from the selection.
4. Generate outputs into a contained local folder (examples):
   - `AGENTS.md` build spec / implementation plan
   - `SPEC.md` requirements doc
   - CSV templates (experiments, tasks, backlog)
   - simple file scaffolds (folders + placeholder files)

Everything else is secondary until this loop feels magical and repeatable.

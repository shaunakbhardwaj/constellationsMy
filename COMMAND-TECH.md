# Command Center — Technical Specification

> **Purpose:** Define the technical architecture for transforming the Maps ElectronJS app into a business operations command center powered by AI agents.

---

## Current Codebase Overview

### What We Have

```
src/
├── main/                     # Electron main process
│   ├── index.ts              # App entry, window creation
│   ├── ipc.ts                # IPC handlers (generate-mindmap, expand-node, memory:*)
│   └── memory/
│       └── store.ts          # MemoryStore class (JSON file persistence)
├── preload/                  # Context bridge
└── renderer/                 # React frontend
    └── src/
        ├── App.tsx           # Main app component
        ├── components/       # UI components
        └── lib/              # Utilities

resources/
└── prompts/                  # System prompts for LLM
    ├── document/             # Mode-specific prompts (extract, brainstorm, flow)
    └── expand.md             # Node expansion prompt
```

### What We Can Reuse

| Component | Current Use | Command Center Use |
|-----------|-------------|-------------------|
| `MemoryStore` | Persist mindmap documents | Persist business state, agent logs, decisions |
| `ipc.ts` handlers | LLM calls for mindmaps | Agent task dispatch, status updates |
| Prompt system | Mindmap generation | Agent skill definitions |
| React renderer | Canvas UI | Dashboard UI |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ELECTRON APP                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    MAIN PROCESS                              │    │
│  │                                                              │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │    │
│  │  │ AgentManager │  │ SkillLoader  │  │ TaskQueue    │       │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │    │
│  │         │                 │                 │                │    │
│  │         ▼                 ▼                 ▼                │    │
│  │  ┌──────────────────────────────────────────────────┐       │    │
│  │  │              Agent Runtime                        │       │    │
│  │  │  • OpenCode Server (sandboxed, per-workspace)     │       │    │
│  │  │  • Codex API (OpenAI)                             │       │    │
│  │  │  • Claude API (Anthropic)                         │       │    │
│  │  └──────────────────────────────────────────────────┘       │    │
│  │         │                                                    │    │
│  │         ▼                                                    │    │
│  │  ┌──────────────────────────────────────────────────┐       │    │
│  │  │              Persistence Layer                    │       │    │
│  │  │  • BusinessStore (extends MemoryStore)            │       │    │
│  │  │  • AgentLogStore                                  │       │    │
│  │  │  • SkillRegistry                                  │       │    │
│  │  └──────────────────────────────────────────────────┘       │    │
│  │                                                              │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                            │ IPC                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   RENDERER PROCESS                           │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────┐       │    │
│  │  │              Command Center UI                    │       │    │
│  │  │  • Dashboard (overview, metrics)                  │       │    │
│  │  │  • Pillar Views (Marketing, Sales, Product, Acc)  │       │    │
│  │  │  • Approval Queue                                 │       │    │
│  │  │  • Activity Feed                                  │       │    │
│  │  │  • Business Config                                │       │    │
│  │  └──────────────────────────────────────────────────┘       │    │
│  │                                                              │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      MOBILE APP (React Native)                      │
│                                                                     │
│  • Voice input → transcription                                      │
│  • Task submission                                                  │
│  • Permission approvals                                             │
│  • Status notifications                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Agent System

#### Agent Definition (`src/main/agents/agent.ts`)

```typescript
interface Agent {
  id: string;
  name: string;
  type: 'opencode' | 'codex' | 'claude';
  status: 'idle' | 'running' | 'waiting_approval' | 'error';
  config: AgentConfig;
}

interface AgentConfig {
  // For OpenCode
  workspacePath?: string;
  port?: number;
  sandboxProfile?: string;
  
  // For Codex/Claude
  apiKey?: string;
  model?: string;
  
  // Common
  skills: string[];  // List of skill IDs this agent can use
  permissions: PermissionPolicy;
}

interface PermissionPolicy {
  autoApprove: string[];   // Patterns that auto-approve (e.g., "git *")
  requireApproval: string[]; // Patterns that need human approval
  deny: string[];           // Patterns that are never allowed
}
```

#### Agent Manager (`src/main/agents/manager.ts`)

```typescript
class AgentManager {
  private agents: Map<string, Agent>;
  private processes: Map<string, ChildProcess>;  // For OpenCode servers
  
  // Lifecycle
  async startAgent(id: string): Promise<void>;
  async stopAgent(id: string): Promise<void>;
  async restartAgent(id: string): Promise<void>;
  
  // Task dispatch
  async sendTask(agentId: string, task: Task): Promise<TaskResult>;
  async cancelTask(agentId: string, taskId: string): Promise<void>;
  
  // Status
  getAgentStatus(id: string): AgentStatus;
  subscribeToEvents(agentId: string, callback: (event: AgentEvent) => void): () => void;
  
  // Permissions
  async handlePermissionRequest(agentId: string, request: PermissionRequest): Promise<void>;
}
```

---

### 2. Skill System

Skills are modular capabilities that agents can use. Each skill is defined in a markdown file with YAML frontmatter.

#### Skill Structure

```
resources/
└── skills/
    ├── marketing/
    │   ├── SKILL.md           # Skill definition
    │   ├── prompts/
    │   │   ├── tweet.md       # Generate tweet content
    │   │   ├── blog.md        # Generate blog post
    │   │   └── analyze.md     # Analyze engagement
    │   └── scripts/
    │       └── schedule.ts    # Twitter scheduling helper
    │
    ├── sales/
    │   ├── SKILL.md
    │   ├── prompts/
    │   │   ├── outreach.md    # Cold email templates
    │   │   └── followup.md    # Follow-up sequences
    │   └── scripts/
    │       └── leads.ts       # Lead research helper
    │
    ├── product/
    │   ├── SKILL.md
    │   ├── prompts/
    │   │   ├── feature.md     # Feature implementation
    │   │   ├── bugfix.md      # Bug investigation
    │   │   └── review.md      # Code review
    │   └── scripts/
    │       └── deploy.ts      # Deployment automation
    │
    └── accounting/
        ├── SKILL.md
        ├── prompts/
        │   ├── expenses.md    # Expense categorization
        │   └── report.md      # Financial report generation
        └── scripts/
            └── costs.ts       # API cost tracking
```

#### Skill Definition Format (`SKILL.md`)

```markdown
---
name: marketing
description: Generate and manage marketing content
version: 1.0.0
pillar: marketing
capabilities:
  - tweet_generation
  - blog_writing
  - engagement_analysis
permissions:
  requires:
    - network_outbound
    - file_write:marketing/*
  optional:
    - twitter_api
---

# Marketing Skill

This skill enables agents to create and manage marketing content.

## Capabilities

### Tweet Generation
Generate engaging tweets based on product updates, industry trends, or custom topics.

**Input:** Topic, tone, optional hashtags
**Output:** 3-5 tweet variations

### Blog Writing
Create long-form blog content with SEO optimization.

**Input:** Title, outline, target keywords
**Output:** Full blog post in markdown

### Engagement Analysis
Analyze past content performance and suggest improvements.

**Input:** Content history, metrics
**Output:** Analysis report with recommendations
```

#### Skill Loader (`src/main/skills/loader.ts`)

```typescript
interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  pillar: 'marketing' | 'sales' | 'product' | 'accounting';
  capabilities: string[];
  permissions: {
    requires: string[];
    optional: string[];
  };
  prompts: Map<string, string>;  // capability -> prompt content
  scripts: Map<string, string>;  // capability -> script path
}

class SkillLoader {
  private skillsDir: string;
  private skills: Map<string, Skill>;
  
  async loadAll(): Promise<void>;
  async loadSkill(skillPath: string): Promise<Skill>;
  getSkill(id: string): Skill | undefined;
  getSkillsForPillar(pillar: string): Skill[];
  getPrompt(skillId: string, capability: string): string | undefined;
}
```

---

### 3. Business State

#### Business Proposition (`src/main/business/proposition.ts`)

```typescript
interface BusinessProposition {
  id: string;
  name: string;
  description: string;
  
  // Core definition
  whatItDoes: string;
  targetAudience: string;
  revenueModel: string;
  
  // Goals
  mrrTarget: number;
  userCountTarget: number;
  timelineWeeks: number;
  
  // Constraints
  budgetMonthly: number;
  apiCostLimit: number;
  hoursPerDay: number;  // Your time investment limit
  
  // Current state
  currentMrr: number;
  currentUsers: number;
  daysActive: number;
}
```

#### Business Store (`src/main/business/store.ts`)

Extends the existing `MemoryStore` pattern:

```typescript
interface BusinessState {
  proposition: BusinessProposition;
  
  pillars: {
    marketing: PillarState;
    sales: PillarState;
    product: PillarState;
    accounting: PillarState;
  };
  
  todaysPlan: DailyPlan;
  activityLog: ActivityEntry[];
  decisions: Decision[];
  metrics: Metrics;
}

interface PillarState {
  tasks: Task[];
  pendingApprovals: Approval[];
  completedToday: number;
  status: 'healthy' | 'attention' | 'blocked';
}

interface DailyPlan {
  date: string;
  generatedAt: number;
  tasks: PlannedTask[];
  rationale: string;  // Why AI planned this
}

class BusinessStore extends MemoryStore {
  async getState(): Promise<BusinessState>;
  async updateProposition(prop: Partial<BusinessProposition>): Promise<void>;
  async addTask(pillar: string, task: Task): Promise<void>;
  async completeTask(taskId: string): Promise<void>;
  async addApproval(approval: Approval): Promise<void>;
  async resolveApproval(approvalId: string, decision: 'approve' | 'deny'): Promise<void>;
  async logActivity(entry: ActivityEntry): Promise<void>;
  async generateDailyPlan(): Promise<DailyPlan>;
}
```

---

### 4. Task Queue

#### Task Definition (`src/main/tasks/task.ts`)

```typescript
interface Task {
  id: string;
  pillar: 'marketing' | 'sales' | 'product' | 'accounting';
  skill: string;
  capability: string;
  
  // Input
  description: string;
  input: Record<string, unknown>;
  
  // Execution
  status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed';
  assignedAgent?: string;
  startedAt?: number;
  completedAt?: number;
  
  // Output
  result?: TaskResult;
  error?: string;
  
  // Approvals
  requiresApproval: boolean;
  approvalRequest?: ApprovalRequest;
}

interface TaskResult {
  success: boolean;
  output: unknown;
  artifacts?: string[];  // File paths created
  nextSteps?: string[];  // Suggested follow-ups
}
```

#### Task Queue (`src/main/tasks/queue.ts`)

```typescript
class TaskQueue {
  private queue: Task[];
  private running: Map<string, Task>;
  private agentManager: AgentManager;
  
  async enqueue(task: Task): Promise<string>;  // Returns task ID
  async process(): Promise<void>;  // Main loop
  async pause(): Promise<void>;
  async resume(): Promise<void>;
  
  // Priority management
  async prioritize(taskId: string, priority: number): Promise<void>;
  async reorder(pillar: string, taskIds: string[]): Promise<void>;
  
  // Status
  getQueueStatus(): QueueStatus;
  getTaskStatus(taskId: string): Task | undefined;
}
```

---

### 5. IPC Handlers

New handlers to add to `src/main/ipc.ts`:

```typescript
// Agent management
ipcMain.handle('agent:list', async () => agentManager.listAgents());
ipcMain.handle('agent:start', async (_, { id }) => agentManager.startAgent(id));
ipcMain.handle('agent:stop', async (_, { id }) => agentManager.stopAgent(id));
ipcMain.handle('agent:status', async (_, { id }) => agentManager.getAgentStatus(id));

// Task management
ipcMain.handle('task:create', async (_, { task }) => taskQueue.enqueue(task));
ipcMain.handle('task:list', async (_, { pillar }) => taskQueue.getTasksForPillar(pillar));
ipcMain.handle('task:cancel', async (_, { id }) => taskQueue.cancel(id));

// Approvals
ipcMain.handle('approval:list', async () => businessStore.getPendingApprovals());
ipcMain.handle('approval:resolve', async (_, { id, decision }) => 
  businessStore.resolveApproval(id, decision));

// Business state
ipcMain.handle('business:get', async () => businessStore.getState());
ipcMain.handle('business:update', async (_, { proposition }) => 
  businessStore.updateProposition(proposition));
ipcMain.handle('business:plan', async () => businessStore.generateDailyPlan());

// Skills
ipcMain.handle('skill:list', async () => skillLoader.listSkills());
ipcMain.handle('skill:get', async (_, { id }) => skillLoader.getSkill(id));

// Activity
ipcMain.handle('activity:list', async (_, { limit }) => businessStore.getActivity(limit));
ipcMain.handle('activity:stream', () => {/* SSE stream setup */});
```

---

### 6. Mobile App Communication

#### Local Network Discovery

```typescript
// src/main/network/discovery.ts
import bonjour from 'bonjour';

class NetworkDiscovery {
  private service: bonjour.Service;
  
  async advertise(port: number, name: string): Promise<void> {
    // Advertise via mDNS so mobile app can find us
    this.service = bonjour().publish({
      name: `CommandCenter-${name}`,
      type: 'http',
      port,
      txt: { version: '1.0' }
    });
  }
  
  async stop(): Promise<void> {
    this.service?.stop();
  }
}
```

#### HTTP Server for Mobile

```typescript
// src/main/network/server.ts
import express from 'express';
import { WebSocketServer } from 'ws';

class MobileServer {
  private app: express.Application;
  private wss: WebSocketServer;
  private authToken: string;  // Generated on startup
  
  constructor(private businessStore: BusinessStore, private taskQueue: TaskQueue) {
    this.app = express();
    this.authToken = crypto.randomBytes(32).toString('hex');
    this.setupRoutes();
  }
  
  private setupRoutes() {
    this.app.use(this.authenticate.bind(this));
    
    // Voice task submission
    this.app.post('/task', async (req, res) => {
      const { transcription, pillar } = req.body;
      const task = await this.parseTranscription(transcription, pillar);
      const taskId = await this.taskQueue.enqueue(task);
      res.json({ taskId });
    });
    
    // Approvals
    this.app.get('/approvals', async (req, res) => {
      const approvals = await this.businessStore.getPendingApprovals();
      res.json(approvals);
    });
    
    this.app.post('/approvals/:id', async (req, res) => {
      const { decision } = req.body;
      await this.businessStore.resolveApproval(req.params.id, decision);
      res.json({ success: true });
    });
    
    // Status
    this.app.get('/status', async (req, res) => {
      const state = await this.businessStore.getState();
      res.json({
        mrr: state.proposition.currentMrr,
        pendingApprovals: state.pillars.marketing.pendingApprovals.length + 
                          state.pillars.sales.pendingApprovals.length +
                          state.pillars.product.pendingApprovals.length +
                          state.pillars.accounting.pendingApprovals.length,
        todayCompleted: Object.values(state.pillars).reduce(
          (sum, p) => sum + p.completedToday, 0
        ),
      });
    });
  }
  
  // WebSocket for real-time updates
  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      // Subscribe to events and forward to mobile
    });
  }
}
```

---

## File Structure After Implementation

```
src/
├── main/
│   ├── index.ts
│   ├── ipc.ts                    # Updated with new handlers
│   │
│   ├── agents/
│   │   ├── agent.ts              # Agent types
│   │   ├── manager.ts            # AgentManager class
│   │   ├── opencode.ts           # OpenCode integration
│   │   └── codex.ts              # Codex/Claude integration
│   │
│   ├── skills/
│   │   ├── loader.ts             # SkillLoader class
│   │   └── executor.ts           # Skill execution
│   │
│   ├── business/
│   │   ├── proposition.ts        # Business types
│   │   ├── store.ts              # BusinessStore class
│   │   └── planner.ts            # AI planning logic
│   │
│   ├── tasks/
│   │   ├── task.ts               # Task types
│   │   └── queue.ts              # TaskQueue class
│   │
│   ├── network/
│   │   ├── discovery.ts          # mDNS for mobile
│   │   └── server.ts             # HTTP/WS server
│   │
│   └── memory/
│       └── store.ts              # Existing, extended
│
├── preload/
│   └── index.ts                  # Updated with new IPC
│
└── renderer/
    └── src/
        ├── App.tsx               # Updated routing
        ├── pages/
        │   ├── Dashboard.tsx     # Main overview
        │   ├── Pillar.tsx        # Per-pillar view
        │   ├── Approvals.tsx     # Approval queue
        │   ├── Activity.tsx      # Activity feed
        │   └── Config.tsx        # Business config
        │
        ├── components/
        │   ├── MetricCard.tsx
        │   ├── TaskList.tsx
        │   ├── ApprovalCard.tsx
        │   ├── ActivityItem.tsx
        │   └── PillarNav.tsx
        │
        └── lib/
            ├── api.ts            # IPC wrappers
            └── types.ts          # Shared types

resources/
├── prompts/                      # Existing
└── skills/
    ├── marketing/
    │   └── SKILL.md
    ├── sales/
    │   └── SKILL.md
    ├── product/
    │   └── SKILL.md
    └── accounting/
        └── SKILL.md
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

1. **Create agent system**
   - `src/main/agents/agent.ts` — Types
   - `src/main/agents/manager.ts` — AgentManager
   - `src/main/agents/opencode.ts` — OpenCode spawning with sandbox

2. **Create skill system**
   - `src/main/skills/loader.ts` — SkillLoader
   - `resources/skills/` — Initial skill definitions

3. **Extend persistence**
   - `src/main/business/store.ts` — BusinessStore
   - `src/main/business/proposition.ts` — Types

4. **Update IPC**
   - Add new handlers to `src/main/ipc.ts`

### Phase 2: Task System (Week 1-2)

1. **Task queue**
   - `src/main/tasks/task.ts` — Types
   - `src/main/tasks/queue.ts` — TaskQueue

2. **Approval flow**
   - Integrate with AgentManager for permission requests
   - Store pending approvals in BusinessStore

### Phase 3: UI Replacement (Week 2)

1. **Remove flowchart UI**
   - Keep Canvas component for potential future use
   - Replace main view with Dashboard

2. **Build command center UI**
   - Dashboard with overview
   - Pillar views
   - Approval queue
   - Activity feed

### Phase 4: Mobile Connection (Week 3)

1. **Add network layer**
   - `src/main/network/discovery.ts`
   - `src/main/network/server.ts`

2. **Add dependencies**
   - `bonjour` for mDNS
   - `express` for HTTP server
   - `ws` for WebSocket

### Phase 5: React Native App (Week 3-4)

Separate repository, connects to Electron app via local network.

---

## Dependencies to Add

```json
{
  "dependencies": {
    "@opencode-ai/sdk": "^1.0.0",
    "bonjour": "^3.5.0",
    "express": "^4.18.0",
    "ws": "^8.14.0",
    "yaml": "^2.3.0"
  }
}
```

---

## Configuration Files

### Agent Configuration (`~/.command-center/agents.json`)

```json
{
  "agents": [
    {
      "id": "opencode-main",
      "name": "Main Development Agent",
      "type": "opencode",
      "config": {
        "workspacePath": "/Users/shaunakbhardwaj/Work/MyApp",
        "skills": ["product"],
        "permissions": {
          "autoApprove": ["git *", "npm install *", "npm run *"],
          "requireApproval": ["rm *", "npm publish"],
          "deny": ["rm -rf /"]
        }
      }
    },
    {
      "id": "claude-content",
      "name": "Content Agent",
      "type": "claude",
      "config": {
        "model": "claude-3-5-sonnet-20241022",
        "skills": ["marketing", "sales"],
        "permissions": {
          "autoApprove": ["file_write:drafts/*"],
          "requireApproval": ["network_outbound", "file_write:published/*"],
          "deny": []
        }
      }
    }
  ]
}
```

### Business Configuration (`~/.command-center/business.json`)

```json
{
  "proposition": {
    "name": "VoiceNotes",
    "description": "Voice memo app that structures your thoughts",
    "whatItDoes": "Record voice → AI structures into actionable notes",
    "targetAudience": "Busy professionals who think out loud",
    "revenueModel": "Freemium: 5 notes/month free, $4.99/month unlimited",
    "mrrTarget": 3000,
    "userCountTarget": 1000,
    "timelineWeeks": 12,
    "budgetMonthly": 200,
    "apiCostLimit": 100,
    "hoursPerDay": 1
  }
}
```

---

## Security Considerations

1. **Sandbox all OpenCode servers** using `sandbox-exec` (see OPENCODE_WORKSPACE_SERVERS.md)
2. **Generate unique auth tokens** for mobile app connection per session
3. **Bind HTTP server to localhost only** unless explicitly configured otherwise
4. **Rate limit API calls** to prevent runaway agent costs
5. **Log all agent actions** for audit trail
6. **Require approval for destructive operations** by default

---

## Verification Plan

### Automated Tests

No existing test suite found. Recommend adding:

1. **Unit tests for BusinessStore**
   ```bash
   npm test -- --grep "BusinessStore"
   ```

2. **Integration tests for AgentManager**
   - Mock OpenCode server
   - Verify task dispatch and result handling

### Manual Verification

1. **Agent lifecycle**
   - Start app → Agent shows as "idle"
   - Submit task → Agent shows as "running"
   - Complete task → See result in activity feed

2. **Approval flow**
   - Submit task requiring approval
   - See approval in queue
   - Approve → Task executes
   - Deny → Task marked as denied

3. **Mobile connection**
   - Start Electron app
   - Open React Native app on same WiFi
   - App discovers Electron via mDNS
   - Submit voice task → See it in Electron app

---

## Next Steps

1. Review this technical spec
2. Confirm/adjust the architecture
3. Begin Phase 1 implementation

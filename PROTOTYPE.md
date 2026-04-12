# Command Center — Prototype Spec

> **Goal:** Control OpenCode from an Electron app. Stream results to a basic UI. Handle permissions.

---

## What We're Building

A minimal dashboard that:
1. Spawns an OpenCode server (sandboxed)
2. Sends tasks via the SDK
3. Streams events to the UI
4. Lets you approve/deny permission requests

That's it. No flowcharts, no pillars, no skills system, no mobile app.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ELECTRON APP                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              MAIN PROCESS                        │    │
│  │                                                  │    │
│  │  • Spawn OpenCode server (sandbox-exec)          │    │
│  │  • Connect via @opencode-ai/sdk                  │    │
│  │  • Stream SSE events to renderer                 │    │
│  │  • Handle permission responses                   │    │
│  └─────────────────────────────────────────────────┘    │
│                         │ IPC                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │              RENDERER (Dashboard)                │    │
│  │                                                  │    │
│  │  • Text input to send tasks                      │    │
│  │  • Activity log (streamed events)                │    │
│  │  • Permission approval buttons                   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTP + SSE
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    OPENCODE SERVER                      │
│              (spawned, sandboxed, localhost)            │
│                                                         │
│  • Receives messages                                    │
│  • Plans & executes (bash, python, etc.)                │
│  • Streams progress                                     │
│  • Requests permissions                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Add Dependencies

```bash
npm install @opencode-ai/sdk
```

### 2. Main Process: OpenCode Integration

**`src/main/opencode.ts`**

```typescript
import { spawn, ChildProcess } from 'child_process';
import Opencode from '@opencode-ai/sdk';
import crypto from 'crypto';

const PORT = 4123;
const USERNAME = 'opencode';
const PASSWORD = crypto.randomBytes(16).toString('hex');

let serverProcess: ChildProcess | null = null;
let client: Opencode | null = null;
let sessionId: string | null = null;

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

export async function startServer(workspacePath: string): Promise<void> {
  // Spawn OpenCode with sandbox (see OPENCODE_WORKSPACE_SERVERS.md)
  serverProcess = spawn('opencode', ['serve', '--hostname', '127.0.0.1', '--port', String(PORT)], {
    cwd: workspacePath,
    env: {
      ...process.env,
      OPENCODE_SERVER_USERNAME: USERNAME,
      OPENCODE_SERVER_PASSWORD: PASSWORD,
    },
  });

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Connect client
  client = new Opencode({
    baseURL: `http://127.0.0.1:${PORT}`,
    defaultHeaders: {
      Authorization: basicAuth(USERNAME, PASSWORD),
    },
  });

  // Create session
  const session = await client.session.create();
  sessionId = session.id;
}

export async function stopServer(): Promise<void> {
  serverProcess?.kill();
  serverProcess = null;
  client = null;
  sessionId = null;
}

export async function sendMessage(text: string): Promise<void> {
  if (!client || !sessionId) throw new Error('Server not running');
  await client.session.chat(sessionId, {
    parts: [{ type: 'text', text }],
  });
}

export async function* streamEvents(): AsyncGenerator<any> {
  if (!client) throw new Error('Server not running');
  const stream = await client.event.list();
  for await (const evt of stream) {
    yield evt;
  }
}

export async function respondToPermission(permissionId: string, allow: boolean): Promise<void> {
  if (!client || !sessionId) throw new Error('Server not running');
  await client.post(`/session/${sessionId}/permissions/${permissionId}`, {
    response: allow ? 'accept' : 'deny',
  });
}
```

### 3. IPC Handlers

**Add to `src/main/ipc.ts`**

```typescript
import { startServer, stopServer, sendMessage, streamEvents, respondToPermission } from './opencode';

ipcMain.handle('opencode:start', async (_, { workspacePath }) => {
  await startServer(workspacePath);
  return { success: true };
});

ipcMain.handle('opencode:stop', async () => {
  await stopServer();
  return { success: true };
});

ipcMain.handle('opencode:send', async (_, { message }) => {
  await sendMessage(message);
  return { success: true };
});

ipcMain.handle('opencode:permission', async (_, { permissionId, allow }) => {
  await respondToPermission(permissionId, allow);
  return { success: true };
});

// For streaming, use IPC event push to renderer
// (set up in startServer after connecting)
```

### 4. Preload Bridge

**Add to `src/preload/index.ts`**

```typescript
contextBridge.exposeInMainWorld('opencode', {
  start: (workspacePath: string) => ipcRenderer.invoke('opencode:start', { workspacePath }),
  stop: () => ipcRenderer.invoke('opencode:stop'),
  send: (message: string) => ipcRenderer.invoke('opencode:send', { message }),
  respondPermission: (permissionId: string, allow: boolean) => 
    ipcRenderer.invoke('opencode:permission', { permissionId, allow }),
  onEvent: (callback: (event: any) => void) => {
    ipcRenderer.on('opencode:event', (_, event) => callback(event));
    return () => ipcRenderer.removeAllListeners('opencode:event');
  },
});
```

### 5. Dashboard UI

**`src/renderer/src/Dashboard.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react';

export function Dashboard() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [pendingPermissions, setPendingPermissions] = useState<any[]>([]);

  useEffect(() => {
    const unsub = window.opencode.onEvent((evt) => {
      setEvents(prev => [...prev, evt]);
      if (evt.type === 'permission_request') {
        setPendingPermissions(prev => [...prev, evt]);
      }
    });
    return unsub;
  }, []);

  const handleStart = async () => {
    await window.opencode.start(process.cwd()); // or specific workspace
    setConnected(true);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    await window.opencode.send(input);
    setInput('');
  };

  const handlePermission = async (id: string, allow: boolean) => {
    await window.opencode.respondPermission(id, allow);
    setPendingPermissions(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>Command Center</h1>

      {!connected ? (
        <button onClick={handleStart}>Start OpenCode Server</button>
      ) : (
        <>
          <div style={{ marginBottom: 20 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Send a task to OpenCode..."
              style={{ width: 400, padding: 8 }}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button onClick={handleSend} style={{ marginLeft: 8 }}>Send</button>
          </div>

          {pendingPermissions.length > 0 && (
            <div style={{ background: '#fff3cd', padding: 10, marginBottom: 20 }}>
              <h3>Pending Approvals</h3>
              {pendingPermissions.map(p => (
                <div key={p.id} style={{ marginBottom: 8 }}>
                  <code>{p.description}</code>
                  <button onClick={() => handlePermission(p.id, true)}>Allow</button>
                  <button onClick={() => handlePermission(p.id, false)}>Deny</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: '#1e1e1e', color: '#0f0', padding: 10, height: 400, overflow: 'auto' }}>
            <h3 style={{ color: '#fff' }}>Activity Log</h3>
            {events.map((evt, i) => (
              <div key={i}>{JSON.stringify(evt)}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/main/opencode.ts` | **NEW** — OpenCode server management |
| `src/main/ipc.ts` | **MODIFY** — Add opencode:* handlers |
| `src/preload/index.ts` | **MODIFY** — Expose opencode API |
| `src/renderer/src/Dashboard.tsx` | **NEW** — Basic dashboard UI |
| `src/renderer/src/App.tsx` | **MODIFY** — Render Dashboard instead of flowchart |

---

## Verification

1. Start the app (`npm run dev`)
2. Click "Start OpenCode Server"
3. Type a task: "Create a file called hello.txt with 'Hello World' in it"
4. See events stream in the log
5. If permission prompt appears, click Allow
6. Check that `hello.txt` was created

---

## What's NOT in This Prototype

- ❌ Business state / propositions
- ❌ Pillars (Marketing, Sales, etc.)
- ❌ Skills system
- ❌ Task queue / scheduling
- ❌ Mobile app
- ❌ mDNS / networking
- ❌ Memory / decision history

These come later, once the basic loop works.

# Ingestion / Drag-and-Drop Incident Report (`constellations`)

This document captures the full story of why drag-and-drop + ingestion was broken, what we changed during debugging, and what the ideal, shippable behavior should be.

The goal is to have a clear “single source of truth” so we can properly fix the remaining issues instead of relying on ad‑hoc patches.

---

## 1. What the feature is supposed to do

High-level intended flow:

1. User drags files into the drop zone in the renderer (`src/renderer/src/App.tsx`).
2. Renderer extracts real file system paths (Electron drag-and-drop) and calls `window.api.importFiles(...)`.
3. Preload (`src/preload/index.ts`) forwards this via IPC: `ipcRenderer.invoke('import-files', ...)`.
4. Main process (`src/main/index.ts`) IPC handler:
   - Validates paths.
   - Copies files into the brain directory (`~/Work/brain`).
   - Calls `processFile(...)` from `src/main/ingestion/index.ts` for each file.
5. Ingestion (`processFile`):
   - Writes/upserts file metadata into SQLite (`files` table).
   - Splits file content into chunks.
   - Generates embeddings for each chunk.
     - **Ideal**: done in a worker thread (`src/main/workers/ingestion.worker.ts`) via `generateEmbeddingsInWorker`.
   - Writes embeddings into LanceDB (`documents` table).
   - Writes chunks into SQLite (`chunks` table).
   - Marks the file as `indexed`.
6. Renderer can then:
   - Show imported files in the table.
   - Use semantic search powered by those embeddings.

That’s the “happy path” we want for shipping.

---

## 2. What actually happened (timeline)

### 2.1 Initial symptoms

- Drag-and-drop visually worked (drop zone changed state) but ended in:
  - Red state: `"Yikes try again"`.
  - No files appeared in the table.
  - No obvious main-process errors related to the dropped file.
- Renderer console showed:

```text
TypeError: Cannot read properties of undefined (reading 'getFilePath')
```

This was thrown inside `extractFilePaths` in `src/renderer/src/App.tsx` when it tried to call:

```ts
window.api.getFilePath(file)
```

But `window.api` was `undefined`.

### 2.2 Root cause #1: preload API not present in renderer (dev)

The preload file is `src/preload/index.ts`. It:

- Builds a `BrainAPI` (`api` object).
- Exposes it to the renderer via:

```ts
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} else {
  // window.electron = ...
  // window.api = ...
}
```

The main process creates a `BrowserWindow` with:

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false
}
```

In dev, the renderer runs off `http://localhost:5173/` (Vite). We added logging to:

- Preload (`src/preload/index.ts`) using `createLogger('preload/api')`.
- Main (`src/main/index.ts`) using `createLogger('main')`.

Diagnostic logs:

- Main reported:

```json
[main] createWindow configuration
{
  "__dirname": "/Users/.../constellations/out/main",
  "preloadPath": "/Users/.../constellations/out/preload/index.js",
  "isDev": true,
  "rendererUrl": "http://localhost:5173"
}
[main] preload script exists { "preloadPath": ".../out/preload/index.js" }
```

So the preload file was there and attached.

- But a post-load probe:

```ts
mainWindow.webContents
  .executeJavaScript(
    `({ apiType: typeof window.api, electronType: typeof window.electron, href: location.href })`
  )
```

reported:

```json
"apiType": "undefined",
"electronType": "undefined"
```

So the preload was not actually exposing `window.api` / `window.electron` into that renderer context.

### 2.3 Fix: make preload exposure unconditional and log it

We changed `src/preload/index.ts` to:

- Always call `contextBridge.exposeInMainWorld('electron', electronAPI)` and `contextBridge.exposeInMainWorld('api', api)` (no `process.contextIsolated` gate).
- Add explicit logs:
  - `preload module loaded` (with contextBridge/webUtils presence).
  - `contextBridge exposed globals`.
  - If that fails, a fallback that sets `globalThis.electron` and `globalThis.api` and logs `fallback assignment completed`.

We also added an additional main-side check after load:

- `renderer globals check` showing `apiType` and `electronType`.

After these changes (and disabling `sandbox` for the BrowserWindow), the log became:

```json
"apiType": "object",
"electronType": "object"
```

And drag-and-drop logs in the renderer changed from:

```text
getFilePath failed; falling back to File.path
...
fallbackPaths: [], deduped: []
drop had zero extracted paths
```

to:

```text
extractFilePaths result from FileList
{
  "paths": ["/Users/.../Downloads/shaunak_profile.md"]
}
calling api.importFiles ...
```

So **root cause #1 (preload not exposing `api`) was fixed.**

At this point:

- `window.api` exists in the renderer.
- `extractFilePaths` correctly returns real OS file paths.
- The IPC call `import-files` is invoked with:

```json
{
  "requestId": "...",
  "paths": ["/Users/.../Downloads/shaunak_profile.md"],
  "source": "drag-drop"
}
```

### 2.4 Root cause #2: ingestion worker binary missing in dev

Once IPC started working, we hit a new failure deeper in the ingestion pipeline.

Main log for a drop looked like:

```json
[main] ipc(import-files) start
{
  "requestId": "...",
  "source": "drag-drop",
  "payloadType": "object",
  "filePathsType": "array",
  "filePathsLength": 1
}
[main] ipc(import-files) processing path
{
  "rawPath": "/Users/.../Downloads/shaunak_profile.md",
  "destination": "/Users/.../Work/brain/shaunak_profile-1.md"
}
[main/ingestion] processFile start
[main/ingestion] processFile file stats
[main/ingestion] processFile split into chunks
[main/ingestion] processFile embeddings batch start
```

Then:

```text
[WorkerManager] Worker error: Error: Cannot find module '/Users/.../constellations/out/main/workers/ingestion.worker.js'
  code: 'MODULE_NOT_FOUND'
[WorkerManager] Worker exited with code 1
```

So:

- `src/main/workers/worker-manager.ts` tries to create a `Worker` with:

```ts
new Worker(join(__dirname, 'workers', 'ingestion.worker.js'))
```

- In dev, `out/main/` only contains `index.js`; there is **no** `out/main/workers/ingestion.worker.js`.
- The worker thread fails to start with `MODULE_NOT_FOUND`.
- Ingestion is trying to generate embeddings via this worker, so embedding generation effectively fails mid-way.

From the user’s perspective:

- The drop box switches to `"hold on... maybe working"` / `"Pretending to work on it..."`.
- There is no clear success message.
- It looks “stuck”.

So **root cause #2 is: the ingestion worker bundle is not being emitted / not found in dev, breaking embeddings.**

---

## 3. What we changed to keep things working now

We did **two** important things:

### 3.1 Make drag-and-drop + IPC robust and observable

Changes:

- `src/shared/logger.ts`: structured logger with timestamps and safe JSON serialization.
- `src/renderer/src/App.tsx`:
  - Added detailed logs for drag/drop:
    - `drop received` with `requestId`, number of files, `DataTransfer.types`.
    - `extractFilePaths start` with raw file names, sizes, types.
    - `extractFilePaths result` with final paths.
    - `calling api.importFiles` and `api.importFiles returned` with correlation via `requestId`.
  - Uses `window.api.getFilePath(file)` via preload (with fallback to `File.path`).
- `src/preload/index.ts`:
  - Logs each `ipcRenderer.invoke` call (`import-files`, `fetch-brain-data`, `search-brain`) with `start`, `done`, and duration.
  - Exposes `window.api` and `window.electron` via `contextBridge` unconditionally, with a fallback assignment.
- `src/main/index.ts`:
  - Logs `createWindow configuration` (including computed preload path).
  - Verifies `preloadPath` exists.
  - After renderer load, probes `typeof window.api` and `typeof window.electron` and logs `renderer globals check`.
  - Extends `ipc(import-files)` logs to track:
    - Incoming payload shape and path count.
    - Per-file copy duration.
    - Per-file ingestion duration.
    - Final success/failure with `requestId`.

Result:

- We can now see **exactly** what path each drag-and-drop goes through, with timestamps and correlation IDs.

### 3.2 Add inline embedding fallback when worker is missing or broken

Changes in `src/main/workers/worker-manager.ts`:

- Imports:

```ts
import { existsSync } from 'fs'
import { createLogger } from '../../shared/logger'
import { generateEmbedding, initEmbeddingModel } from '../ai/embeddings'
```

- Introduced state:

```ts
let useWorker = true
let lastFailure: unknown = null
```

- New helper `generateEmbeddingsInline(chunks: string[])`:
  - Calls `initEmbeddingModel()` to load the `@xenova/transformers` model.
  - For each chunk, calls `generateEmbedding(chunk)` (the same embedding model, just inline).
  - Logs `inline embedding fallback start` and `done`.

- Updated `ensureWorker()`:
  - If `useWorker` is `false`, returns immediately (no worker attempts).
  - Checks if the worker file exists with `existsSync(workerPath)`:
    - If missing:
      - Sets `lastFailure` to an error describing the missing file.
      - Logs `worker missing; enabling inline fallback`.
      - Sets `useWorker = false`.
      - Returns.
  - If file exists, attempts to create the worker:
    - On `init-error`, `error`, or `exit`:
      - Records `lastFailure`.
      - Sets `useWorker = false`.
      - Allows the caller to fall back inline.

- Updated `generateEmbeddingsInWorker(chunks)`:

```ts
await ensureWorker()

if (!useWorker || !worker || !isInitialized) {
  return generateEmbeddingsInline(chunks)
}

const id = uuidv4()

return new Promise<number[][]>((resolve, reject) => {
  pendingRequests.set(id, { resolve, reject })
  try {
    worker!.postMessage({ type: 'generate', id, chunks })
  } catch (error) {
    pendingRequests.delete(id)
    lastFailure = error
    useWorker = false
    generateEmbeddingsInline(chunks).then(resolve).catch(reject)
  }
}).catch((error) => {
  lastFailure = error
  useWorker = false
  return generateEmbeddingsInline(chunks)
})
```

What this means:

- First try to use the worker (if the binary exists and can start).
- If the worker file is missing, worker init fails, or runtime errors occur:
  - We log the failure.
  - Switch to inline embeddings via `initEmbeddingModel` + `generateEmbedding`.
  - Subsequent calls skip worker initialization entirely and go straight to inline mode.

**Important:** The model is still used. The difference is:

- **Originally intended:** embeddings run in a worker thread.
- **Current fallback:** embeddings run inline in the main process.

So functionally ingestion can complete, but performance and responsiveness may be worse.

---

## 4. Where all of this happens (file map)

- Renderer:
  - `src/renderer/src/App.tsx` – drag-and-drop logic, calls `window.api.importFiles`.
  - `src/renderer/src/main.tsx` – wraps `<App />` in `ErrorBoundary`.
  - `src/renderer/src/components/ErrorBoundary.tsx` – catches React render errors.

- Preload:
  - `src/preload/index.ts` – defines `BrainAPI`, logs IPC calls, exposes `window.api` / `window.electron`.
  - `src/preload/index.d.ts` – type declaration for `window.api` (uses `BrainAPI` from shared types).

- Main:
  - `src/main/index.ts` – Electron app bootstrap, window creation, IPC handlers for:
    - `'import-files'`
    - `'fetch-brain-data'`
    - `'search-brain'`
  - `src/main/ingestion/index.ts` – `processFile`, main ingestion logic:
    - Interacts with SQLite and LanceDB.
    - Calls `generateEmbeddingsInWorker`.
  - `src/main/scanner.ts` – initial scan of brain directory.
  - `src/main/watcher.ts` – filesystem watcher reacting to changes.
  - `src/main/db/*` – SQLite and LanceDB setup.
  - `src/main/workers/worker-manager.ts` – manages worker thread and inline embedding fallback.
  - `src/main/workers/ingestion.worker.ts` – worker thread code for embeddings.
  - `src/main/ai/embeddings.ts` – non-worker embedding pipeline using `@xenova/transformers`.

- Shared:
  - `src/shared/types.ts` – all shared types (`BrainFileRow`, `SearchResult`, `BrainAPI`, etc.).
  - `src/shared/logger.ts` – timestamped structured logger.

---

## 5. How it should work ideally (for shipping)

Right now the app is **functionally** working with an inline fallback, but this is not the ideal, shippable architecture. The ideal behavior:

1. **Preload & globals**
   - `window.api` and `window.electron` are exposed reliably via `contextBridge`.
   - No reliance on `sandbox: false` for correct behavior if we can avoid it; security posture should be revisited.
   - The diagnostics we added (startup logs, renderer globals check) remain in place, maybe gated by a debug flag.

2. **Worker build pipeline**
   - `ingestion.worker.ts` is properly bundled for Electron main in dev and production.
   - `out/main/workers/ingestion.worker.js` exists in dev.
   - `getWorkerPath()` resolves correctly both in dev and prod.
   - We should add a small sanity check or build-time validation that ensures the worker bundle is present.

3. **Embeddings in a worker by default**
   - `generateEmbeddingsInWorker` successfully offloads all embedding work to the worker thread.
   - Inline fallback (`generateEmbeddingsInline`) is used only when:
     - Worker fails unexpectedly at runtime.
     - Or we explicitly disable the worker for debugging.
   - For shipping builds, we might keep the fallback as a safety net, but we should expect the worker path to be correct.

4. **Clear user feedback**
   - Drag/drop status:
     - Shows “uploading” while ingestion is running.
     - Switches to a clear success message once ingestion completes.
     - Shows any ingestion error message if something fails (e.g., model download failure, no network).
   - Data table:
     - Updates after a successful import so users see new files and their indexing status.

5. **Resilient model caching**
   - Deleting the model/cache directory (e.g., that mysterious `library` folder) should not permanently break ingestion:
     - On next run, the embedding model re-downloads or reinitializes cleanly.
   - If network is unavailable and the model can’t be downloaded:
     - The app should show a clear error (e.g., “Unable to load embedding model; check your connection”).

---

## 6. What we still need to fix before shipping

1. **Worker bundling in dev and prod**
   - Ensure that `electron-vite` is configured to build `ingestion.worker.ts` into `out/main/workers/ingestion.worker.js` (and the equivalent in production).
   - Verify path resolution of `getWorkerPath()` in all environments:
     - Dev: `out/main/...`
     - Prod: packaged app path.

2. **Performance / UX validation**
   - With the worker correctly built, confirm:
     - First model load time is acceptable (or show progress).
     - Importing moderate-size files doesn’t freeze the UI.

3. **Error surfacing**
   - Tighten how ingestion errors propagate back to the renderer:
     - If embeddings fail (even with fallback), the user should see a friendly, actionable message.
   - Right now, errors are logged and ingestion tries to keep going; we may want a stricter “fail fast and report” policy for P0 bugs.

4. **Security posture**
   - Revisit `sandbox: false` on the BrowserWindow once we understand the exact interaction between Electron sandboxing, preload, and Vite in this setup.
   - Ideally restore a more secure configuration while keeping `window.api` working.

---

## 7. Summary

- **Root cause #1:** preload wasn’t exposing `window.api` in dev, so drag/drop couldn’t get real file paths and bailed early.
- **Root cause #2:** ingestion worker bundle (`ingestion.worker.js`) doesn’t exist in dev, so embedding generation via the worker crashed, leaving imports in a “maybe working” state.
- **Current state:** 
  - Preload exposure is fixed and well-instrumented.
  - Drag/drop successfully extracts OS paths and calls IPC.
  - If the worker is missing or broken, we fall back to inline embedding generation using the same model.
- **Ideal shipping state:**
  - Worker is correctly built and used by default.
  - Inline fallback is only a safety net.
  - The app gives clear, reliable feedback and remains responsive even under heavy ingestion.

This document should be kept up-to-date as we fix the worker bundling and refine the ingestion flow, so future debugging doesn’t have to re-rediscover this entire path. 


import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { promises as fs } from 'fs'
import { join, parse, relative, normalize, resolve, isAbsolute } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDatabases, closeDatabases, getSQLite } from './db'
import { processFile } from './ingestion'
import { getBrainDirectory } from './brain-path'
import { scanBrainDirectory } from './scanner'
import { initWatcher, closeWatcher } from './watcher'
import { disposeIngestionWorker } from './workers/worker-manager'
import { searchBrain } from './search'
import type { SearchResult } from './search'

// Security: Allowed protocols for external URLs
const ALLOWED_PROTOCOLS = ['https:', 'http:']

// Security: Maximum rename attempts to prevent infinite loops
const MAX_RENAME_ATTEMPTS = 1000

// Flag to prevent multiple cleanup attempts
let isQuitting = false

type FileTransferPayload = {
  source: string
  destination: string
}

type BrainFileRow = {
  id: string
  path: string
  relativePath: string
  type: string
  mimeType: string | null
  sizeBytes: number | null
  createdAt: number
  modifiedAt: number
  lastIndexedAt: number | null
  indexedStatus: string | null
  chunkCount: number
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Security: Validate external URLs before opening
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (ALLOWED_PROTOCOLS.includes(url.protocol)) {
        shell.openExternal(details.url)
      } else {
        console.warn(`[Security] Blocked external URL with protocol: ${url.protocol}`)
      }
    } catch {
      console.warn('[Security] Invalid URL blocked:', details.url)
    }
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  try {
    await initDatabases()
    // Worker initializes lazily on first use, no explicit init needed

    const brainDirectory = getBrainDirectory()
    await fs.mkdir(brainDirectory, { recursive: true })
    await scanBrainDirectory(brainDirectory)
    initWatcher(brainDirectory)
  } catch (error) {
    console.error('[App] Fatal initialization error:', error)
    dialog.showErrorBox(
      'Startup Error',
      `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    app.quit()
    return
  }

  const brainDirectory = getBrainDirectory()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('import-files', async (_, filePaths: string[]) => {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return { success: false, error: 'No files were provided.' }
    }

    // Security: Validate all paths before processing
    const allowedSourceDirs = [
      app.getPath('home'),
      app.getPath('documents'),
      app.getPath('downloads'),
      app.getPath('desktop')
    ]

    for (const rawPath of filePaths) {
      if (typeof rawPath !== 'string' || rawPath.trim().length === 0) continue
      if (!isPathSafe(rawPath, allowedSourceDirs)) {
        return { success: false, error: `Access denied: ${rawPath}` }
      }
    }

    try {
      await fs.mkdir(brainDirectory, { recursive: true })
      const transfers: FileTransferPayload[] = []

      for (const rawPath of filePaths) {
        if (typeof rawPath !== 'string' || rawPath.trim().length === 0) continue
        const baseName = parse(rawPath).base
        if (!baseName) continue
        const destination = await ensureUniqueDestination(brainDirectory, baseName)
        await copyEntry(rawPath, destination)
        const relPath = relative(brainDirectory, destination)
        await processFile(destination, relPath)
        transfers.push({ source: rawPath, destination })
      }

      if (transfers.length === 0) {
        return { success: false, error: 'No valid files could be processed.' }
      }

      return { success: true, files: transfers }
    } catch (error) {
      console.error('Failed to import files', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown file import error'
      }
    }
  })

  ipcMain.handle('fetch-brain-data', () => {
    try {
      const sqlite = getSQLite()
      const statement = sqlite.prepare<[], BrainFileRow>(`
        SELECT
          f.id AS id,
          f.path AS path,
          f.relative_path AS relativePath,
          f.type AS type,
          f.mime_type AS mimeType,
          f.size_bytes AS sizeBytes,
          f.created_at AS createdAt,
          f.modified_at AS modifiedAt,
          f.last_indexed_at AS lastIndexedAt,
          f.indexed_status AS indexedStatus,
          COUNT(c.id) AS chunkCount
        FROM files f
        LEFT JOIN chunks c ON c.file_id = f.id
        GROUP BY f.id
        ORDER BY f.created_at DESC
        LIMIT 500
      `)

      const files = statement.all()
      return { success: true, files }
    } catch (error) {
      console.error('Failed to fetch brain data', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown database error'
      }
    }
  })

  ipcMain.handle('search-brain', async (_, query: string) => {
    if (!query || query.trim().length === 0) {
      return { success: false, error: 'Query cannot be empty' }
    }

    try {
      const rawResults = await searchBrain(query.trim(), 10)

      const db = getSQLite()
      const enrichedResults = rawResults.map((result: SearchResult) => {
        const fileInfo = db
          .prepare(
            `
        SELECT relative_path, indexed_status 
        FROM files 
        WHERE id = ?
      `
          )
          .get(result.fileId) as { relative_path: string; indexed_status: string } | undefined

        return {
          ...result,
          fileName: fileInfo?.relative_path ?? 'Unknown',
          isIndexed: fileInfo?.indexed_status === 'indexed'
        }
      })

      return { success: true, results: enrichedResults }
    } catch (error) {
      console.error('[IPC] Search failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed'
      }
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (!isQuitting) {
    isQuitting = true
    event.preventDefault()

    Promise.all([
      closeWatcher(),
      disposeIngestionWorker(),
      closeDatabases()
    ])
      .catch((error) => console.error('[App] Cleanup error:', error))
      .finally(() => app.exit(0))
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

async function copyEntry(source: string, destination: string): Promise<void> {
  const stats = await fs.stat(source)

  if (stats.isDirectory()) {
    await fs.cp(source, destination, { recursive: true })
  } else {
    await fs.copyFile(source, destination)
  }
}

async function ensureUniqueDestination(directory: string, baseName: string): Promise<string> {
  const parsed = parse(baseName)

  for (let attempt = 0; attempt < MAX_RENAME_ATTEMPTS; attempt++) {
    const suffix = attempt === 0 ? '' : `-${attempt}`
    const candidateName = `${parsed.name}${suffix}${parsed.ext}`
    const candidatePath = join(directory, candidateName)

    try {
      await fs.access(candidatePath)
      // File exists, continue to next attempt
    } catch {
      return candidatePath
    }
  }

  throw new Error(`Could not find unique name for ${baseName} after ${MAX_RENAME_ATTEMPTS} attempts`)
}

/**
 * Security: Validate that a path is within allowed directories
 * Prevents path traversal attacks and access to sensitive files
 */
function isPathSafe(filePath: string, allowedDirs: string[]): boolean {
  if (!isAbsolute(filePath)) {
    return false
  }

  const normalized = normalize(resolve(filePath))

  for (const allowed of allowedDirs) {
    const normalizedAllowed = normalize(resolve(allowed))
    if (normalized.startsWith(normalizedAllowed)) {
      return true
    }
  }

  return false
}

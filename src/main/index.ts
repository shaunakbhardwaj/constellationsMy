import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDatabases, closeDatabases } from './db'
import { getBrainDirectory } from './brain-path'
import { scanBrainDirectory } from './scanner'
import { initWatcher, closeWatcher } from './watcher'
import { disposeIngestionWorker } from './workers/worker-manager'
import { registerAllHandlers } from './ipc'
import { createLogger } from '../shared/logger'
import { loadApiKeys } from './config/secrets'
import { initializeLLMFromStorage } from './ipc/handlers/llm'

// Security: Allowed protocols for external URLs
const ALLOWED_PROTOCOLS = ['https:', 'http:']

// Flag to prevent multiple cleanup attempts
let isQuitting = false

const log = createLogger('main')

function createWindow(): void {
  const preloadPath = join(__dirname, '../preload/index.js')
  log.info('createWindow configuration', {
    __dirname,
    preloadPath,
    isDev: is.dev,
    rendererUrl: process.env['ELECTRON_RENDERER_URL']
  })
  void fs
    .access(preloadPath)
    .then(() => log.info('preload script exists', { preloadPath }))
    .catch((error) => log.error('preload script missing/unreadable', { preloadPath, error }))

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
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
        log.warn('blocked external URL with disallowed protocol', { protocol: url.protocol })
      }
    } catch {
      log.warn('invalid URL blocked', { url: details.url })
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

  if (is.dev) {
    mainWindow.webContents.once('did-finish-load', () => {
      void mainWindow.webContents
        .executeJavaScript(
          `({ apiType: typeof window.api, electronType: typeof window.electron, href: location.href })`
        )
        .then((result) => log.info('renderer globals check', result))
        .catch((error) => log.error('renderer globals check failed', { error }))
    })
  }

  mainWindow.webContents.on('preload-error', (_event, preloadPathArg, error) => {
    log.error('preload-error event', { preloadPathArg, error })
  })
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

    // Load API keys from secure storage
    loadApiKeys()
    initializeLLMFromStorage()

    const brainDirectory = getBrainDirectory()
    log.info('startup: ensured brain directory + scan/watch', { brainDirectory })
    await fs.mkdir(brainDirectory, { recursive: true })
    await scanBrainDirectory(brainDirectory)
    initWatcher(brainDirectory)
  } catch (error) {
    log.error('startup: fatal initialization error', { error })
    dialog.showErrorBox(
      'Startup Error',
      `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    app.quit()
    return
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => log.debug('ping received'))

  // Register all IPC handlers from modular handler files
  registerAllHandlers(ipcMain)

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

    Promise.all([closeWatcher(), disposeIngestionWorker(), closeDatabases()])
      .catch((error) => log.error('cleanup error during quit', { error }))
      .finally(() => app.exit(0))
  }
})

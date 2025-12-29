import { app, shell, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAllHandlers } from './ipc'
import { createLogger } from '../shared/logger'
import { loadApiKeys } from './data/secrets'
import { disposeIngestionWorker } from './data/workers/worker-manager'

const ALLOWED_PROTOCOLS = ['https:', 'http:']

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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  loadApiKeys()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAllHandlers()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (!isQuitting) {
    isQuitting = true
    event.preventDefault()

    Promise.all([disposeIngestionWorker()])
      .catch((error) => log.error('cleanup error during quit', { error }))
      .finally(() => app.exit(0))
  }
})

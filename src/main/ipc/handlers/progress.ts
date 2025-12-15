/**
 * IPC Handlers for Progress Events
 * Forwards scanner and indexing progress to renderer
 */
import { ipcMain, BrowserWindow } from 'electron'
import { scannerEvents, ScanProgress } from '../../scanner'
import { createLogger } from '../../../shared/logger'

const log = createLogger('ipc/progress')

export function registerProgressHandlers(): void {
  // Forward scanner progress to all windows
  scannerEvents.on('progress', (progress: ScanProgress) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('scan-progress', progress)
    }
  })

  // Allow renderer to request a rescan
  ipcMain.handle('request-rescan', async (_, brainDir: string) => {
    try {
      const { scanBrainDirectory } = await import('../../scanner')
      await scanBrainDirectory(brainDir)
      return { success: true }
    } catch (error) {
      log.error('rescan failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Rescan failed'
      }
    }
  })

  log.info('Progress handlers registered')
}

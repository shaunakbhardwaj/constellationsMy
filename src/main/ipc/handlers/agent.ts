/**
 * IPC Handlers for Autonomous Agent
 */
import { ipcMain, BrowserWindow } from 'electron'
import { getAutonomousAgent } from '../../agent'
import { createLogger } from '../../../shared/logger'

const log = createLogger('ipc/agent')

export function registerAgentHandlers(): void {
  const agent = getAutonomousAgent()

  // Get agent state
  ipcMain.handle('agent-get-state', async () => {
    try {
      const state = agent.getState()
      return { success: true, state }
    } catch (error) {
      log.error('agent-get-state failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get agent state'
      }
    }
  })

  // Start agent with a goal
  ipcMain.handle('agent-start', async (_, goalId: string) => {
    try {
      await agent.start(goalId)
      return { success: true }
    } catch (error) {
      log.error('agent-start failed', { error, goalId })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start agent'
      }
    }
  })

  // Pause agent
  ipcMain.handle('agent-pause', async () => {
    try {
      agent.pause()
      return { success: true }
    } catch (error) {
      log.error('agent-pause failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pause agent'
      }
    }
  })

  // Resume agent
  ipcMain.handle('agent-resume', async () => {
    try {
      agent.resume()
      return { success: true }
    } catch (error) {
      log.error('agent-resume failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resume agent'
      }
    }
  })

  // Stop agent
  ipcMain.handle('agent-stop', async () => {
    try {
      agent.stop()
      return { success: true }
    } catch (error) {
      log.error('agent-stop failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop agent'
      }
    }
  })

  // Send guidance to agent
  ipcMain.handle('agent-guidance', async (_, guidance: string) => {
    try {
      await agent.sendGuidance(guidance)
      return { success: true }
    } catch (error) {
      log.error('agent-guidance failed', { error })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send guidance'
      }
    }
  })

  // Subscribe to state changes and forward to renderer
  agent.onStateChange((state) => {
    // Send state update to all windows
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('agent-state-update', state)
    }
  })

  log.info('Agent handlers registered')
}

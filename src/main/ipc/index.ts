/**
 * IPC Handler Registration
 *
 * Central module for registering all IPC handlers.
 * This keeps the main process file clean and organized.
 */

import { IpcMain } from 'electron'
import { registerFileHandlers } from './handlers/files'
import { registerBrainHandlers } from './handlers/brain'
import { registerSearchHandlers } from './handlers/search'
import { registerConfigHandlers } from './handlers/config'
import { registerLogHandlers } from './handlers/logs'
import { registerGoalsHandlers } from './handlers/goals'
import { registerAgentHandlers } from './handlers/agent'
import { registerLLMHandlers } from './handlers/llm'
import { registerProgressHandlers } from './handlers/progress'

/**
 * Register all IPC handlers with the main process
 */
export function registerAllHandlers(ipcMain: IpcMain): void {
  registerFileHandlers(ipcMain)
  registerBrainHandlers(ipcMain)
  registerSearchHandlers(ipcMain)
  registerConfigHandlers(ipcMain)
  registerLogHandlers(ipcMain)
  registerGoalsHandlers()
  registerAgentHandlers()
  registerLLMHandlers()
  registerProgressHandlers()
}


import { app } from 'electron'
import { createWriteStream, type WriteStream } from 'fs'
import { join } from 'path'
import { mkdirSync } from 'fs'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  component: string
  message: string
  data?: unknown
  error?: string
  stack?: string
}

let logStream: WriteStream | null = null
let isInitialized = false

/**
 * Initialize the logger. Should be called early in app startup.
 * Logs are written to the app's userData directory.
 */
export function initLogger(): void {
  if (isInitialized) return

  try {
    const logsDir = join(app.getPath('userData'), 'logs')
    mkdirSync(logsDir, { recursive: true })

    const logFile = join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`)
    logStream = createWriteStream(logFile, { flags: 'a' })
    isInitialized = true

    logger.info('Logger', 'Log file initialized', { path: logFile })
  } catch (error) {
    console.error('[Logger] Failed to initialize log file:', error)
  }
}

/**
 * Close the logger. Should be called on app shutdown.
 */
export function closeLogger(): void {
  if (logStream) {
    logStream.end()
    logStream = null
    isInitialized = false
  }
}

function writeLog(level: LogLevel, component: string, message: string, data?: unknown): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message
  }

  if (data !== undefined) {
    if (data instanceof Error) {
      entry.error = data.message
      entry.stack = data.stack
    } else {
      entry.data = data
    }
  }

  // Write to file if available
  if (logStream) {
    logStream.write(JSON.stringify(entry) + '\n')
  }

  // Also log to console in development
  const isDev = !app.isPackaged

  if (isDev || level === 'error' || level === 'warn') {
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${component}]`
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log

    if (data !== undefined) {
      logFn(prefix, message, data)
    } else {
      logFn(prefix, message)
    }
  }
}

/**
 * Structured logger for the application.
 * Writes to both console (in dev) and a log file.
 */
export const logger = {
  /**
   * Debug level - only shows in development, not written to console in production
   */
  debug: (component: string, message: string, data?: unknown): void => {
    writeLog('debug', component, message, data)
  },

  /**
   * Info level - general operational messages
   */
  info: (component: string, message: string, data?: unknown): void => {
    writeLog('info', component, message, data)
  },

  /**
   * Warning level - potential issues that don't prevent operation
   */
  warn: (component: string, message: string, data?: unknown): void => {
    writeLog('warn', component, message, data)
  },

  /**
   * Error level - errors that affect functionality
   */
  error: (component: string, message: string, error?: Error | unknown): void => {
    writeLog('error', component, message, error)
  }
}

export default logger

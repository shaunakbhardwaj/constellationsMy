/**
 * Unified Logging System
 *
 * Provides a consistent logging interface across main, preload, and renderer processes.
 * - In main process: Uses electron-log for file persistence
 * - In preload/renderer: Uses console with structured output
 *
 * Log files are stored in:
 * - macOS: ~/Library/Logs/my-app/
 * - Windows: %USERPROFILE%\AppData\Roaming\my-app\logs\
 * - Linux: ~/.config/my-app/logs/
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogMeta = Record<string, unknown> | unknown[] | string | number | boolean | null

// Detect if we're in the main process
const isMainProcess =
  typeof process !== 'undefined' && process.type === 'browser' && process.versions?.electron

// Will be lazily initialized in main process
type ElectronLog = {
  transports: {
    file: {
      level: LogLevel | false
      maxSize: number
      format: string
      resolvePathFn: () => string
    }
    console: {
      level: LogLevel | false
      format: string
    }
  }
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

let electronLog: ElectronLog | null = null

/**
 * Initialize electron-log for main process
 */
function getElectronLog(): ElectronLog | null {
  if (!isMainProcess) return null
  if (electronLog) return electronLog

  try {
    // Dynamic import to avoid bundling issues in renderer
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const log = require('electron-log')

    // Configure file transport
    log.transports.file.level = 'info'
    log.transports.file.maxSize = 10 * 1024 * 1024 // 10MB
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

    // Configure console transport
    log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'
    log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}'

    electronLog = log
    return log
  } catch (error) {
    console.error('[Logger] Failed to initialize electron-log:', error)
    return null
  }
}

function toISOStringWithFallback(date: Date): string {
  try {
    return date.toISOString()
  } catch {
    return String(date)
  }
}

function safeSerialize(meta: unknown): string {
  const seen = new WeakSet<object>()

  return JSON.stringify(
    meta,
    (_key, value) => {
      if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack }
      }
      if (typeof value === 'bigint') return value.toString()
      if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]'
        seen.add(value)
      }
      return value
    },
    2
  )
}

/**
 * Format the log message with metadata
 */
function formatMessage(context: string, message: string, meta?: LogMeta): string {
  const metaStr = meta !== undefined ? ` ${safeSerialize(meta)}` : ''
  return `[${context}] ${message}${metaStr}`
}

/**
 * Write log using console (for preload/renderer)
 */
function writeConsoleLog(level: LogLevel, context: string, message: string, meta?: LogMeta): void {
  const ts = toISOStringWithFallback(new Date())
  const prefix = `[${ts}][${context}]`
  const line = meta === undefined ? `${prefix} ${message}` : `${prefix} ${message}\n${safeSerialize(meta)}`

  switch (level) {
    case 'debug':
      console.debug(line)
      return
    case 'info':
      console.info(line)
      return
    case 'warn':
      console.warn(line)
      return
    case 'error':
      console.error(line)
      return
  }
}

/**
 * Write log using electron-log (for main process)
 */
function writeElectronLog(
  log: ElectronLog,
  level: LogLevel,
  context: string,
  message: string,
  meta?: LogMeta
): void {
  const formattedMessage = formatMessage(context, message, meta)

  switch (level) {
    case 'debug':
      log.debug(formattedMessage)
      return
    case 'info':
      log.info(formattedMessage)
      return
    case 'warn':
      log.warn(formattedMessage)
      return
    case 'error':
      log.error(formattedMessage)
      return
  }
}

/**
 * Universal log writer that routes to appropriate backend
 */
function writeLog(level: LogLevel, context: string, message: string, meta?: LogMeta): void {
  const log = getElectronLog()

  if (log) {
    writeElectronLog(log, level, context, message, meta)
  } else {
    writeConsoleLog(level, context, message, meta)
  }
}

/**
 * Create a logger instance for a specific context/module
 *
 * @param context - The module/component name for the logger
 * @returns Logger object with debug, info, warn, error methods
 *
 * @example
 * const log = createLogger('main/ingestion')
 * log.info('Processing file', { path: '/path/to/file.txt' })
 */
export function createLogger(context: string): {
  debug: (message: string, meta?: LogMeta) => void
  info: (message: string, meta?: LogMeta) => void
  warn: (message: string, meta?: LogMeta) => void
  error: (message: string, meta?: LogMeta) => void
} {
  return {
    debug: (message, meta) => writeLog('debug', context, message, meta),
    info: (message, meta) => writeLog('info', context, message, meta),
    warn: (message, meta) => writeLog('warn', context, message, meta),
    error: (message, meta) => writeLog('error', context, message, meta)
  }
}

/**
 * Get the log file path (main process only)
 * Returns null if not in main process or electron-log not initialized
 */
export function getLogFilePath(): string | null {
  const log = getElectronLog()
  if (!log) return null

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electronLogModule = require('electron-log')
    return electronLogModule.transports.file.getFile()?.path ?? null
  } catch {
    return null
  }
}

/**
 * Set the log level (main process only)
 * Affects both file and console transports
 */
export function setLogLevel(level: LogLevel): void {
  const log = getElectronLog()
  if (!log) return

  log.transports.file.level = level
  log.transports.console.level = level
}

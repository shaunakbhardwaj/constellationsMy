import fs from 'fs/promises';
import path from 'path';

type LogLevel = 'info' | 'warn' | 'error';

type LogEntry = {
  ts: string;
  level: LogLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
};

type LLMExchangeEntry = {
  ts: string;
  kind: 'llm';
  requestId: string;
  operation: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: Record<string, unknown>;
  status: 'success' | 'error';
  content?: string;
  error?: Record<string, unknown> | unknown;
};

function serializeError(value: unknown): Record<string, unknown> | unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

export class AppLogger {
  private readonly logDir: string;
  private readonly logPath: string;
  private readonly llmLogPath: string;

  constructor(baseDir: string) {
    this.logDir = path.join(baseDir, 'logs');
    this.logPath = path.join(this.logDir, 'app.log');
    this.llmLogPath = path.join(this.logDir, 'llm.log');
  }

  private async write(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>) {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      scope,
      message,
      meta: meta
        ? Object.fromEntries(Object.entries(meta).map(([key, value]) => [key, serializeError(value)]))
        : undefined,
    };

    const line = `${JSON.stringify(entry)}\n`;
    await fs.mkdir(this.logDir, { recursive: true });
    await fs.appendFile(this.logPath, line, 'utf-8');

    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(`[${scope}] ${message}`, meta || '');
  }

  info(scope: string, message: string, meta?: Record<string, unknown>) {
    return this.write('info', scope, message, meta);
  }

  warn(scope: string, message: string, meta?: Record<string, unknown>) {
    return this.write('warn', scope, message, meta);
  }

  error(scope: string, message: string, meta?: Record<string, unknown>) {
    return this.write('error', scope, message, meta);
  }

  getLogPath() {
    return this.logPath;
  }

  getLLMLogPath() {
    return this.llmLogPath;
  }

  async logLLMExchange(entry: Omit<LLMExchangeEntry, 'ts' | 'kind'>) {
    const fullEntry: LLMExchangeEntry = {
      ts: new Date().toISOString(),
      kind: 'llm',
      ...entry,
      error: entry.error ? serializeError(entry.error) : undefined,
    };
    const line = `${JSON.stringify(fullEntry)}\n`;
    await fs.mkdir(this.logDir, { recursive: true });
    await fs.appendFile(this.llmLogPath, line, 'utf-8');
    const consoleMethod = entry.status === 'error' ? console.error : console.log;
    consoleMethod(`[llm:${entry.operation}] ${entry.status}`, {
      requestId: entry.requestId,
      model: entry.model,
    });
  }

  async readRecent(limit = 200): Promise<LogEntry[]> {
    try {
      const raw = await fs.readFile(this.logPath, 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);
      return lines
        .slice(Math.max(0, lines.length - limit))
        .map((line) => {
          try {
            return JSON.parse(line) as LogEntry;
          } catch {
            return {
              ts: new Date().toISOString(),
              level: 'warn',
              scope: 'logger',
              message: 'Failed to parse log line',
              meta: { line },
            } as LogEntry;
          }
        });
    } catch {
      return [];
    }
  }

  async readRecentLLM(limit = 100): Promise<LLMExchangeEntry[]> {
    try {
      const raw = await fs.readFile(this.llmLogPath, 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);
      return lines
        .slice(Math.max(0, lines.length - limit))
        .map((line) => JSON.parse(line) as LLMExchangeEntry);
    } catch {
      return [];
    }
  }
}

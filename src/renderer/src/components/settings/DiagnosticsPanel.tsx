'use client';

import { useEffect, useRef } from 'react';
import styles from './DiagnosticsPanel.module.css';

type LogEntry = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
};

type LLMEntry = {
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
  error?: Record<string, unknown>;
};

interface DiagnosticsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  entries: LogEntry[];
  logPath: string;
  llmEntries: LLMEntry[];
  llmLogPath: string;
  isLoading: boolean;
  onRefresh: () => void;
}

export default function DiagnosticsPanel({
  isOpen,
  onClose,
  entries,
  logPath,
  llmEntries,
  llmLogPath,
  isLoading,
  onRefresh,
}: DiagnosticsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div ref={panelRef} className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Diagnostics</h2>
            <p className={styles.subtitle}>Recent runtime logs from the local app logger.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.refreshButton} onClick={onRefresh} disabled={isLoading}>
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className={styles.closeButton} onClick={onClose} aria-label="Close diagnostics">
              ×
            </button>
          </div>
        </div>

        <div className={styles.pathBox}>
          <span className={styles.pathLabel}>Log file</span>
          <code className={styles.pathValue}>{logPath || 'No log file yet'}</code>
        </div>

        <div className={styles.pathBox}>
          <span className={styles.pathLabel}>LLM log file</span>
          <code className={styles.pathValue}>{llmLogPath || 'No LLM log file yet'}</code>
        </div>

        <div className={styles.list}>
          <div className={styles.sectionLabel}>LLM Exchanges</div>
          {llmEntries.length === 0 ? (
            <div className={styles.emptyState}>No LLM exchanges recorded yet.</div>
          ) : (
            llmEntries.map((entry, index) => (
              <div key={`${entry.requestId}-${index}`} className={styles.entry}>
                <div className={styles.entryHeader}>
                  <span className={`${styles.level} ${styles[`level_${entry.status === 'success' ? 'info' : 'error'}`]}`}>
                    {entry.status}
                  </span>
                  <span className={styles.scope}>{entry.operation}</span>
                  <span className={styles.scope}>{entry.model}</span>
                  <span className={styles.ts}>{new Date(entry.ts).toLocaleString()}</span>
                </div>
                <div className={styles.message}>Request ID: {entry.requestId}</div>
                <pre className={styles.meta}>{JSON.stringify({
                  systemPrompt: entry.systemPrompt,
                  userPrompt: entry.userPrompt,
                  response: entry.content,
                  error: entry.error,
                  temperature: entry.temperature,
                  maxTokens: entry.maxTokens,
                  responseFormat: entry.responseFormat,
                }, null, 2)}</pre>
              </div>
            ))
          )}

          <div className={styles.sectionLabel}>Runtime Logs</div>
          {entries.length === 0 ? (
            <div className={styles.emptyState}>No log entries yet.</div>
          ) : (
            entries.map((entry, index) => (
              <div key={`${entry.ts}-${index}`} className={styles.entry}>
                <div className={styles.entryHeader}>
                  <span className={`${styles.level} ${styles[`level_${entry.level}`]}`}>{entry.level}</span>
                  <span className={styles.scope}>{entry.scope}</span>
                  <span className={styles.ts}>{new Date(entry.ts).toLocaleString()}</span>
                </div>
                <div className={styles.message}>{entry.message}</div>
                {entry.meta && (
                  <pre className={styles.meta}>{JSON.stringify(entry.meta, null, 2)}</pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

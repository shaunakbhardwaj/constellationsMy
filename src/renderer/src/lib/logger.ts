export async function logEvent(params: {
  level?: 'info' | 'warn' | 'error';
  scope?: string;
  message: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await window.api.log.event(params);
  } catch {
    // Logging should never break the UI.
  }
}


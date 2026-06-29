type Level = 'info' | 'warn' | 'error';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: Level, message: string, data?: Record<string, unknown>): void {
  const entry = data
    ? `${formatTimestamp()} [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}`
    : `${formatTimestamp()} [${level.toUpperCase()}] ${message}`;
  if (level === 'error') {
    console.error(entry);
  } else {
    console.log(entry);
  }
}

/**
 * Extract a readable message from an unknown thrown value. Some dependencies
 * (notably @actual-app/api) reject with plain objects like
 * `{ type: 'APIError', message: '...' }`; `String(err)` turns those into the
 * useless `[object Object]`, so prefer a `.message` field and fall back to JSON.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),
};

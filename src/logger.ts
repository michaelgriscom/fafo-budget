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

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),
};

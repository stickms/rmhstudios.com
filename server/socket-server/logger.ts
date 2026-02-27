/**
 * Socket Server — Structured Logger
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  event: string;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, entry: LogEntry): string {
  return JSON.stringify({
    level,
    service: 'socket-server',
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

export const logger = {
  info(entry: LogEntry): void {
    console.log(formatLog('info', entry));
  },
  warn(entry: LogEntry): void {
    console.warn(formatLog('warn', entry));
  },
  error(entry: LogEntry): void {
    console.error(formatLog('error', entry));
  },
  debug(entry: LogEntry): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('debug', entry));
    }
  },
};

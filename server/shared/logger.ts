/**
 * Shared Structured Logger for all standalone servers.
 *
 * Emits structured JSON logs with a consistent schema so they can be
 * easily parsed by log aggregation tools (Datadog, Grafana Loki, etc.).
 *
 * Usage:
 *   import { createLogger } from '../shared/logger';
 *   const logger = createLogger('rmhbox');
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  event: string;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, service: string, entry: LogEntry): string {
  return JSON.stringify({
    level,
    service,
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

export interface Logger {
  info(entry: LogEntry): void;
  warn(entry: LogEntry): void;
  error(entry: LogEntry): void;
  debug(entry: LogEntry): void;
}

export function createLogger(service: string): Logger {
  return {
    info(entry: LogEntry): void {
      console.log(formatLog('info', service, entry));
    },
    warn(entry: LogEntry): void {
      console.warn(formatLog('warn', service, entry));
    },
    error(entry: LogEntry): void {
      console.error(formatLog('error', service, entry));
    },
    debug(entry: LogEntry): void {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(formatLog('debug', service, entry));
      }
    },
  };
}

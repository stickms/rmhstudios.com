/**
 * Shared Structured Logger for all standalone servers.
 *
 * Emits structured JSON logs with a consistent schema so they can be
 * easily parsed by log aggregation tools (Datadog, Grafana Loki, etc.).
 *
 * Usage:
 *   import { createLogger } from '../shared/logger';
 *   const logger = createLogger('rmhbox');
 *
 * ## Levels
 *
 * `LOG_LEVEL` (`debug` | `info` | `warn` | `error` | `silent`) sets the floor.
 * Unset, it is `debug` outside production and `info` in production — which is
 * what this logger did before the level existed, so nothing about a deploy
 * changes by adding it.
 *
 * The threshold is read on **every call** rather than captured when the logger
 * is built. That costs an env lookup per line and buys two things: a process
 * can raise its own verbosity at runtime, and a test can turn the logger down
 * around an assertion without re-importing the module (`testing/setup/`
 * silences the whole suite this way — the rmhbox phase tests drive real game
 * loops, and at `info` they bury a run's output under ~10k JSON lines).
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/** Ordered severities. `silent` sits above every real level, so nothing clears it. */
const SEVERITY: Record<LogLevel | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface LogEntry {
  event: string;
  [key: string]: unknown;
}

/** The minimum severity that gets written, from `LOG_LEVEL`. */
function threshold(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (configured && configured in SEVERITY) {
    return SEVERITY[configured as keyof typeof SEVERITY];
  }
  return process.env.NODE_ENV === 'production' ? SEVERITY.info : SEVERITY.debug;
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
  const write = (level: LogLevel, sink: (line: string) => void, entry: LogEntry): void => {
    if (SEVERITY[level] < threshold()) return;
    sink(formatLog(level, service, entry));
  };

  return {
    info(entry: LogEntry): void {
      write('info', (line) => console.log(line), entry);
    },
    warn(entry: LogEntry): void {
      write('warn', (line) => console.warn(line), entry);
    },
    error(entry: LogEntry): void {
      write('error', (line) => console.error(line), entry);
    },
    debug(entry: LogEntry): void {
      write('debug', (line) => console.debug(line), entry);
    },
  };
}

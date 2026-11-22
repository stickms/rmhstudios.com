/**
 * Pure shaping for the background jobs console (`/admin/jobs`): queue ordering, the first line of a
 * failure, secret redaction and the 8 KB cap on what a job's data or output sends to the browser.
 * Client-safe: no Prisma, no pg-boss, no zod.
 */

/** The job states the console lists, in tab order. They are pg-boss's own state names. */
export const JOB_LIST_STATES = ['failed', 'retry', 'active', 'created'] as const;
export type JobListState = (typeof JOB_LIST_STATES)[number];

/** Most jobs one retry, cancel or delete call may name. */
export const MAX_BULK_JOBS = 100;
/** Rows per page of a queue's job list. */
export const JOBS_PAGE_SIZE = 50;
/** Most bytes of a job's data or output sent to the browser, each. */
export const MAX_FIELD_BYTES = 8192;
/** Longest first line of an error shown in a list row. */
export const MAX_ERROR_LINE = 240;

export type JobAction = 'retry' | 'cancel' | 'delete';

export interface JobSchedule {
  key: string;
  /** The cron expression, or the recurrence rule when `kind` is `rrule`. */
  cron: string;
  kind: string;
  timezone: string;
  /** ISO instant of the next run; null when the expression is not a cron one or cannot be read. */
  nextRunAt: string | null;
}

/** One leased job kind's line in the jobs console (s09-13). */
export type LeasedKind = 'bulk' | 'fanout' | 'sweep';

export interface LeasedKindSummary {
  kind: LeasedKind;
  /** RUNNING and claimed by a runner since the last reclaim. */
  running: number;
  /** RUNNING, re-queued by a reclaim (or never started) and not claimed since: waiting for a worker. */
  waiting: number;
  failedLast7Days: number;
}

export interface QueueSummary {
  name: string;
  policy: string | null;
  deadLetter: string | null;
  /** Queued and ready to run now. */
  ready: number;
  /** Queued for later (start time ahead, or waiting on a flow parent). */
  deferred: number;
  active: number;
  failed: number;
  total: number;
  /** ISO time of the newest failure still retained; null when there is none. */
  newestFailureAt: string | null;
  schedules: JobSchedule[];
}

export interface JobRow {
  id: string;
  createdOn: string;
  startedOn: string | null;
  completedOn: string | null;
  retryCount: number;
  retryLimit: number;
  /** First line of the error, when the job has one. */
  error: string | null;
}

export interface JsonField {
  text: string;
  truncated: boolean;
}

export interface JobDetail {
  id: string;
  queue: string;
  state: string;
  data: JsonField | null;
  output: JsonField | null;
  createdOn: string;
  startedOn: string | null;
  completedOn: string | null;
  startAfter: string | null;
  retryCount: number;
  retryLimit: number;
  singletonKey: string | null;
  deadLetter: string | null;
}

/** Failures first, then by name; each group alphabetical. */
export function sortQueues<
  T extends {
    name: string;
    failed: number;
  },
>(queues: readonly T[]): T[] {
  return [...queues].sort((a, b) => {
    const af = a.failed > 0 ? 0 : 1;
    const bf = b.failed > 0 ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/** Case-insensitive name filter for the queue list. */
export function filterQueues<
  T extends {
    name: string;
  },
>(queues: readonly T[], needle: string): T[] {
  const q = needle.trim().toLowerCase();
  return q ? queues.filter((x) => x.name.toLowerCase().includes(q)) : [...queues];
}

/**
 * The first non-empty line of a job's error, capped. A failed pg-boss job's output is usually
 * `{ message, stack }`, sometimes a bare string; anything else has no error line.
 */
export function errorFirstLine(output: unknown): string | null {
  let text: string | null = null;
  if (typeof output === 'string') text = output;
  else if (output && typeof output === 'object') {
    const message = (
      output as {
        message?: unknown;
      }
    ).message;
    if (typeof message === 'string') text = message;
  }
  if (text === null) return null;
  const line = text.split(/\r?\n/).find((l) => l.trim() !== '');
  if (!line) return null;
  const trimmed = line.trim();
  return trimmed.length > MAX_ERROR_LINE ? `${trimmed.slice(0, MAX_ERROR_LINE - 1)}…` : trimmed;
}

const SECRET_KEY = /pass(word|wd)?|secret|token|authorization|api[-_]?key|cookie|credential|private[-_]?key/i;
const MAX_DEPTH = 8;

/** A copy of `value` with the value of any secret-looking key replaced; nested to a bounded depth. */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[too deep]';
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY.test(k) ? '[redacted]' : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Format `value` as indented JSON, cut to at most `maxBytes` of UTF-8 with a flag when it was. */
export function truncateJson(value: unknown, maxBytes: number = MAX_FIELD_BYTES): JsonField {
  const text = JSON.stringify(value, null, 2) ?? 'null';
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes)
    return {
      text,
      truncated: false,
    };
  // A cut inside a multi-byte character decodes to U+FFFD at the end; drop it.
  const cut = new TextDecoder().decode(bytes.subarray(0, maxBytes)).replace(/�+$/, '');
  return {
    text: cut,
    truncated: true,
  };
}

/** What a job's data or output becomes for the browser: redacted, formatted, capped. */
export function toJsonField(value: unknown): JsonField | null {
  return value === null || value === undefined ? null : truncateJson(redactSecrets(value));
}

/** `2026-11-21 14:03:11 UTC`: a fixed rendering, so the server and the client agree. */
export function formatUtc(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** The ids of a comma-separated list, or null when empty, over the cap, or any is not a UUID. */
export function parseIdList(csv: string): string[] | null {
  const ids = csv.split(',').map((s) => s.trim().toLowerCase());
  if (ids.length === 0 || ids.length > MAX_BULK_JOBS) return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!ids.every((id) => uuid.test(id))) return null;
  return [...new Set(ids)];
}

/** Which jobs each action may touch, by state (the retry and cancel rules are pg-boss's own). */
export const ACTIONS_BY_STATE: Record<JobAction, readonly string[]> = {
  retry: ['failed'],
  cancel: ['created', 'retry', 'active'],
  delete: ['failed', 'cancelled'],
};
export function actionsFor(state: string): JobAction[] {
  return (Object.keys(ACTIONS_BY_STATE) as JobAction[]).filter((a) => ACTIONS_BY_STATE[a].includes(state));
}

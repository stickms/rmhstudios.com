/**
 * Developer API oversight (pure): the rows the admin page shows, the rates it derives and the
 * limit the rate limiter applies. No database, no zod, so the page and the tests share it.
 */
import { effectiveMinuteLimit } from '@/lib/api/tier-limits';

/** Keys on one page of /admin/api-keys. */
export const API_KEYS_PAGE_SIZE = 50;
/** The usage window, in UTC days, today included (the same 7 days the owner's refusal count uses). */
export const API_KEYS_WINDOW_DAYS = 7;
/** A suspension's reason, in characters. */
export const SUSPEND_REASON_MIN = 10;
export const SUSPEND_REASON_MAX = 500;
/** An admin rate cap, requests a minute. */
export const ADMIN_CAP_MIN = 1;
export const ADMIN_CAP_MAX = 600;
/** "Errors above 20%". */
export const HIGH_ERROR_RATE = 0.2;

export const API_KEY_STATUSES = ['active', 'suspended', 'expired'] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

export interface ApiKeyUsage {
  requests: number;
  units: number;
  clientErrors: number;
  serverErrors: number;
}

export interface AdminApiKeyRow {
  id: string;
  name: string;
  /** Display prefix and the last four characters: never the hash or the secret. */
  prefix: string;
  lastFour: string | null;
  testMode: boolean;
  owner: {
    id: string;
    handle: string | null;
    name: string | null;
  };
  scopes: string[];
  /** How many source addresses the key is limited to; the ranges themselves never leave the server. */
  allowedCidrCount: number;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  status: ApiKeyStatus;
  suspendedAt: string | null;
  suspendReason: string | null;
  rateLimitPerMinute: number | null;
  adminRateLimitPerMinute: number | null;
  today: ApiKeyUsage;
  week: ApiKeyUsage;
  /** Requests refused by the source-address allowlist in the window. */
  refusals: number;
  webhooks: {
    total: number;
    disabled: number;
  };
}

export interface AdminApiKeysPage {
  keys: AdminApiKeyRow[];
  nextCursor: string | null;
}

export const EMPTY_USAGE: ApiKeyUsage = {
  requests: 0,
  units: 0,
  clientErrors: 0,
  serverErrors: 0,
};

/** Share of requests that ended in the given error count, 0 to 1 (0 when there were no requests). */
export function errorRate(errors: number, requests: number): number {
  if (!(requests > 0) || !(errors > 0)) return 0;
  return Math.min(1, errors / requests);
}

/** The status a row shows. A suspended key that has also expired reads as suspended: the admin acts on that. */
export function keyStatus(
  key: {
    suspendedAt: Date | null;
    expiresAt: Date | null;
  },
  now: Date,
): ApiKeyStatus {
  if (key.suspendedAt) return 'suspended';
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

/**
 * The per-minute limit the rate limiter applies: the lowest of the tier's, the owner's own limit and
 * an admin's cap. A limit below 1 is ignored.
 */
export function effectiveRateLimit(tier: string, ownerLimit: number | null, adminLimit: number | null): number {
  const base = effectiveMinuteLimit(tier, ownerLimit);
  return adminLimit !== null && adminLimit >= 1 ? Math.min(base, adminLimit) : base;
}

/** UTC day keys of the window, newest first: `YYYYMMDD` (usage rollup) and `YYYY-MM-DD` (refusals). */
export function windowDays(now: Date): {
  compact: string[];
  dashed: string[];
} {
  const dashed: string[] = [];
  for (let i = 0; i < API_KEYS_WINDOW_DAYS; i++) {
    dashed.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return {
    compact: dashed.map((d) => d.replaceAll('-', '')),
    dashed,
  };
}

/** Fold a key's per-day rows into today's and the window's totals. */
export function sumUsage(
  rows: Array<
    ApiKeyUsage & {
      day: string;
    }
  >,
  todayCompact: string,
): {
  today: ApiKeyUsage;
  week: ApiKeyUsage;
} {
  const today = {
    ...EMPTY_USAGE,
  };
  const week = {
    ...EMPTY_USAGE,
  };
  for (const r of rows) {
    week.requests += r.requests;
    week.units += r.units;
    week.clientErrors += r.clientErrors;
    week.serverErrors += r.serverErrors;
    if (r.day === todayCompact) {
      today.requests += r.requests;
      today.units += r.units;
      today.clientErrors += r.clientErrors;
      today.serverErrors += r.serverErrors;
    }
  }
  return {
    today,
    week,
  };
}

/** The cursor of a page: units-ranked keys continue by offset, then keys with no usage by id. */
export type KeysCursor =
  | {
      phase: 'ranked';
      offset: number;
    }
  | {
      phase: 'idle';
      afterId: string | null;
    };

export function encodeCursor(c: KeysCursor): string {
  return c.phase === 'ranked' ? `r:${c.offset}` : `i:${c.afterId ?? ''}`;
}

export function decodeCursor(raw: string | null | undefined): KeysCursor | null {
  if (!raw)
    return {
      phase: 'ranked',
      offset: 0,
    };
  const m = /^([ri]):(.*)$/.exec(raw);
  if (!m) return null;
  if (m[1] === 'r') {
    if (!/^\d{1,6}$/.test(m[2]!)) return null;
    return {
      phase: 'ranked',
      offset: Number(m[2]),
    };
  }
  if (m[2] !== '' && !/^[A-Za-z0-9_-]{1,64}$/.test(m[2]!)) return null;
  return {
    phase: 'idle',
    afterId: m[2] === '' ? null : m[2]!,
  };
}

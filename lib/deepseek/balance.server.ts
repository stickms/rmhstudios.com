/**
 * DeepSeek account balance — fetch, persist, read back. Server-only.
 *
 * `GET {base}/user/balance` is an account endpoint at the API root, not under
 * `/v1`, while the rest of the app's DEEPSEEK_BASE_URL defaults to
 * `https://api.deepseek.com/v1` (lib/ai/text.server.ts), so a trailing `/v1` is
 * stripped here. The key is only ever sent as a bearer header; it is never
 * logged or put in an error message.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { hourBucket, type BalanceSample } from '@/lib/deepseek/balance';

export const DEEPSEEK_DEFAULT_BASE = 'https://api.deepseek.com';
export const DEEPSEEK_FETCH_TIMEOUT_MS = 10_000;
/** Snapshots older than this are deleted by the hourly job. */
export const DEEPSEEK_RETENTION_DAYS = 400;

export type DeepseekErrorCode =
  'not_configured' | 'timeout' | 'invalid_response' | `http_${number}`;

export class DeepseekBalanceError extends Error {
  readonly code: DeepseekErrorCode;
  constructor(code: DeepseekErrorCode) {
    super(code);
    this.name = 'DeepseekBalanceError';
    this.code = code;
  }
}

const amount = z
  .string()
  .trim()
  .refine((s) => s !== '' && Number.isFinite(Number(s)), 'not a number');

const responseSchema = z.object({
  is_available: z.boolean(),
  balance_infos: z.array(
    z.object({
      currency: z.string().min(1).max(8),
      total_balance: amount,
      granted_balance: amount,
      topped_up_balance: amount,
    }),
  ),
});

export interface DeepseekBalanceInfo {
  currency: string;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
}

export interface DeepseekBalance {
  isAvailable: boolean;
  balances: DeepseekBalanceInfo[];
  fetchedAt: string;
}

/**
 * Map a balance error to a JSON response. Upstream trouble is never a 500:
 * unconfigured is 503, a slow upstream 504, anything else the upstream did 502.
 * Unknown errors are rethrown so `defineHandler` answers a bare 500.
 */
export function deepseekErrorResponse(err: unknown, extra: Record<string, unknown> = {}): Response {
  if (!(err instanceof DeepseekBalanceError)) throw err;
  const status = err.code === 'not_configured' ? 503 : err.code === 'timeout' ? 504 : 502;
  const upstreamStatus = err.code.startsWith('http_') ? Number(err.code.slice(5)) : undefined;
  return Response.json(
    { error: err.code, ...(upstreamStatus ? { upstreamStatus } : {}), ...extra },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function isDeepseekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

function balanceUrl(): string {
  const base = (process.env.DEEPSEEK_BASE_URL?.trim() || DEEPSEEK_DEFAULT_BASE)
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '');
  return `${base}/user/balance`;
}

export async function fetchDeepseekBalance(): Promise<DeepseekBalance> {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new DeepseekBalanceError('not_configured');

  let res: Response;
  try {
    res = await fetch(balanceUrl(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(DEEPSEEK_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new DeepseekBalanceError('timeout');
    // Network failure: no status to report, and the message could echo the URL.
    throw new DeepseekBalanceError('http_502');
  }
  if (!res.ok) throw new DeepseekBalanceError(`http_${res.status}`);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new DeepseekBalanceError('invalid_response');
  }
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw new DeepseekBalanceError('invalid_response');

  return {
    isAvailable: parsed.data.is_available,
    balances: parsed.data.balance_infos.map((b) => ({
      currency: b.currency,
      totalBalance: Number(b.total_balance),
      grantedBalance: Number(b.granted_balance),
      toppedUpBalance: Number(b.topped_up_balance),
    })),
    fetchedAt: new Date().toISOString(),
  };
}

export interface PersistedSnapshot {
  createdAt: string;
  currency: string;
  isAvailable: boolean;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
  source: string;
}

/**
 * Fetch and persist one row per currency. Upserts on (currency, hour, source):
 * the hourly cron is idempotent under redelivery, and repeated manual refreshes
 * within an hour keep the latest reading instead of piling up rows.
 */
export async function recordDeepseekBalance(
  source: 'cron' | 'manual',
): Promise<{ balance: DeepseekBalance; rows: PersistedSnapshot[] }> {
  const balance = await fetchDeepseekBalance();
  const now = new Date(balance.fetchedAt);
  const bucket = hourBucket(now);
  const rows: PersistedSnapshot[] = [];
  for (const b of balance.balances) {
    const data = {
      createdAt: now,
      isAvailable: balance.isAvailable,
      totalBalance: b.totalBalance,
      grantedBalance: b.grantedBalance,
      toppedUpBalance: b.toppedUpBalance,
    };
    await prisma.deepseekBalanceSnapshot.upsert({
      where: { currency_hourBucket_source: { currency: b.currency, hourBucket: bucket, source } },
      create: { ...data, currency: b.currency, hourBucket: bucket, source },
      update: data,
    });
    rows.push({
      createdAt: now.toISOString(),
      currency: b.currency,
      isAvailable: balance.isAvailable,
      totalBalance: b.totalBalance,
      grantedBalance: b.grantedBalance,
      toppedUpBalance: b.toppedUpBalance,
      source,
    });
  }
  return { balance, rows };
}

/** Samples from the last `hours` hours, oldest first. */
export async function getDeepseekBalanceHistory({
  hours,
}: {
  hours: number;
}): Promise<BalanceSample[]> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await prisma.deepseekBalanceSnapshot.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({
    createdAt: r.createdAt,
    currency: r.currency,
    totalBalance: Number(r.totalBalance),
    grantedBalance: Number(r.grantedBalance),
    toppedUpBalance: Number(r.toppedUpBalance),
    source: r.source,
  }));
}

/** Newest persisted row per currency (any source). */
export async function getLatestDeepseekSnapshots(): Promise<PersistedSnapshot[]> {
  const rows = await prisma.deepseekBalanceSnapshot.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const seen = new Set<string>();
  const out: PersistedSnapshot[] = [];
  for (const r of rows) {
    if (seen.has(r.currency)) continue;
    seen.add(r.currency);
    out.push({
      createdAt: r.createdAt.toISOString(),
      currency: r.currency,
      isAvailable: r.isAvailable,
      totalBalance: Number(r.totalBalance),
      grantedBalance: Number(r.grantedBalance),
      toppedUpBalance: Number(r.toppedUpBalance),
      source: r.source,
    });
  }
  return out;
}

/** Hourly job body: skip silently when unconfigured, record, then prune. */
export async function runDeepseekBalanceJob(): Promise<{ recorded: number; pruned: number }> {
  if (!isDeepseekConfigured()) {
    // eslint-disable-next-line no-console -- debug-level skip notice, not an app log
    console.debug('[deepseek-balance] DEEPSEEK_API_KEY unset; skipping');
    return { recorded: 0, pruned: 0 };
  }
  let recorded = 0;
  try {
    recorded = (await recordDeepseekBalance('cron')).rows.length;
  } catch (err) {
    // Code only: never the message, which could carry request detail.
    console.error(
      '[deepseek-balance] fetch failed:',
      err instanceof DeepseekBalanceError ? err.code : 'unexpected',
    );
  }
  const cutoff = new Date(Date.now() - DEEPSEEK_RETENTION_DAYS * 86_400_000);
  const pruned = (
    await prisma.deepseekBalanceSnapshot.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
  ).count;
  return { recorded, pruned };
}

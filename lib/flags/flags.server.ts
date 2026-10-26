import { prisma } from '@/lib/prisma.server';
import { evaluateFlag, type FlagRecord } from './evaluate';

/**
 * Flag lookup for server code.
 *
 *   if (await isFeatureEnabled('new-checkout', userId)) …
 *
 * Reads the whole (tiny) table at most once per TTL per process, so a hot path
 * costs a Map lookup. A flag flipped in the admin API is visible in this process
 * immediately and in the others within `TTL_MS`. If the database is unreachable
 * the last known values are kept; with none, every flag is off (fail closed:
 * unreleased code stays dark).
 */
const TTL_MS = 15_000;

let cache: { at: number; flags: Map<string, FlagRecord> } | null = null;
let inflight: Promise<Map<string, FlagRecord>> | null = null;

async function load(): Promise<Map<string, FlagRecord>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.flags;
  inflight ??= prisma.featureFlag
    .findMany({ select: { key: true, enabled: true, rolloutPercent: true } })
    .then((rows) => {
      const flags = new Map(rows.map((row) => [row.key, row]));
      cache = { at: Date.now(), flags };
      return flags;
    })
    .catch(() => {
      // Keep serving the last known values; retry after the TTL.
      cache = { at: Date.now(), flags: cache?.flags ?? new Map() };
      return cache.flags;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function isFeatureEnabled(key: string, userId?: string | null): Promise<boolean> {
  return evaluateFlag((await load()).get(key), userId);
}

/** Every flag evaluated for one caller — what `/api/flags` hands the client. */
export async function evaluateAllFlags(userId?: string | null): Promise<Record<string, boolean>> {
  const flags = await load();
  return Object.fromEntries([...flags].map(([key, flag]) => [key, evaluateFlag(flag, userId)]));
}

/** Drop the cache after a write so this process sees it at once. */
export function invalidateFlags(): void {
  cache = null;
}

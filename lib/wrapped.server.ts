/**
 * Cached accessor for the yearly "Wrapped".
 *
 * Wraps `generateYearlyWrapped` with a per-user+year in-memory cache so both the
 * `/api/wrapped` GET handler and the `/wrapped` route loader serve the same
 * summary without re-aggregating or re-billing the AI model. The route loader
 * uses this so Wrapped is server-rendered / prefetched instead of fetched on
 * mount.
 */

import { generateYearlyWrapped, type YearlyWrapped } from '@/lib/wrapped/wrapped.server';

// Cache per user+year so re-opening (or the loader + a later client fetch)
// doesn't re-aggregate/re-bill the model.
const cache = new Map<string, { wrapped: YearlyWrapped; at: number }>();
const TTL_MS = 6 * 60 * 60 * 1000;

export async function getYearlyWrapped(userId: string, year?: number): Promise<YearlyWrapped> {
  const resolved = year ?? new Date().getUTCFullYear();
  const key = `${userId}:${resolved}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.wrapped;
  const wrapped = await generateYearlyWrapped(userId, resolved);
  cache.set(key, { wrapped, at: Date.now() });
  return wrapped;
}

/**
 * Cached accessor for the weekly "Your week on RMH" recap.
 *
 * Wraps `generateWeeklyRecap` with a per-user in-memory cache so both the
 * `/api/recap` GET handler and the `/recap` route loader serve the same recap
 * without re-aggregating or re-billing the AI model. The route loader uses this
 * so the recap is server-rendered / prefetched instead of fetched on mount.
 */

import { generateWeeklyRecap, type WeeklyRecap } from '@/lib/ai/recap.server';

// Cache per user so re-opening (or the loader + a later client fetch) doesn't
// re-bill the model.
const cache = new Map<string, { recap: WeeklyRecap; at: number }>();
const TTL_MS = 60 * 60 * 1000;

export async function getWeeklyRecap(userId: string): Promise<WeeklyRecap> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.recap;
  const recap = await generateWeeklyRecap(userId);
  cache.set(userId, { recap, at: Date.now() });
  return recap;
}

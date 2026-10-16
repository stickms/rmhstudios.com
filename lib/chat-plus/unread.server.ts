/**
 * Nudge a recipient's denormalised DM-unread counter (Redis) when P04 writes a
 * message on their behalf. Mirrors `adjustDmUnread` in
 * `app/routes/api/messages/$conversationId.ts` — keep the key and TTL in sync
 * with it and with the reader in `api/messages/stream.ts`.
 */

import { redisEnabled, redisGetJSON, redisIncrBy } from '@/lib/redis.server';

const DM_UNREAD_TTL_MS = 60_000;

export async function adjustDmUnread(userId: string, delta: number): Promise<void> {
  if (delta === 0 || !redisEnabled()) return;
  try {
    const key = `dm:unread:${userId}`;
    const current = await redisGetJSON<number>(key);
    if (typeof current !== 'number') return; // cold — the next read backfills
    const next = await redisIncrBy(key, delta, DM_UNREAD_TTL_MS);
    if (next !== null && next < 0) await redisIncrBy(key, -next, DM_UNREAD_TTL_MS);
  } catch {
    /* best-effort — the counter self-heals from a COUNT on TTL expiry */
  }
}

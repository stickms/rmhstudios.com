/**
 * The Daily board's cache (RMH Music Phase 6, plan 1.7): one sorted list per date, and the one
 * place that drops it.
 *
 * A consent change must win over a rebuild that is already running in another process. Each date
 * has a generation in Redis; every writer that changes who is on a board (a switch, a newly ranked
 * run, a moderator's hide, a ban, an account deletion) bumps it, and a reader caches the list
 * under the generation it read before loading. A rebuild that read the rows before the change
 * therefore writes its list (in L1 and L2) under the old generation, where no reader looks again;
 * only its own caller sees it.
 *
 * Without Redis there is no generation and no cross-process invalidation: the list is cached in
 * the process only, for `BOARD_LOCAL_TTL_MS`, and a local write drops it at once.
 */
import { cached, invalidateCached } from '@/lib/cached.server';
import { redisIncrBy } from '@/lib/redis.server';
import { utcDate } from '../sprint/generate';
import { boardCacheKey, friendsCacheKey } from './cache-keys';

const DAY_MS = 86_400_000;

/** How long a date's list is kept when Redis keeps its generation. */
export const BOARD_TTL_MS = 30_000;

/** How long a process keeps a date's list when there is no Redis. */
export const BOARD_LOCAL_TTL_MS = 5_000;

/** A generation outlives every board that can read it (today and yesterday). */
const GENERATION_TTL_MS = 3 * DAY_MS;

function generationKey(date: string): string {
  return `${boardCacheKey(date)}:gen`;
}

/** A date's list, cached under the generation read before the load. */
export async function cachedBoard<T>(date: string, loader: () => Promise<T>): Promise<T> {
  const generation = await redisIncrBy(generationKey(date), 0, GENERATION_TTL_MS);
  if (generation === null)
    return cached(boardCacheKey(date), BOARD_LOCAL_TTL_MS, loader, {
      l2: false,
    });
  return cached(`${boardCacheKey(date)}:g${generation}`, BOARD_TTL_MS, loader);
}

/** Drop a date's list everywhere: bump its generation, and drop the local copy. */
export async function invalidateBoard(date: string): Promise<void> {
  await redisIncrBy(generationKey(date), 1, GENERATION_TTL_MS);
  await invalidateCached(boardCacheKey(date));
}

/**
 * Drop what a change to one learner makes stale: the boards of today and yesterday (the only dates
 * a board shows) and their own friends list. Other viewers' friends lists expire within 30 s.
 */
export async function dropLearnerBoardCaches(userId: string, now: number): Promise<void> {
  await Promise.all([
    invalidateBoard(utcDate(now)),
    invalidateBoard(utcDate(now - DAY_MS)),
    invalidateCached(friendsCacheKey(userId)),
  ]);
}

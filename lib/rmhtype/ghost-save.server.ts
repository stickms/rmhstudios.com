/**
 * RMHType ghosts: the write the socket hub makes on a solo finish. Kept apart from
 * `./ghost.server` so the hub bundle does not load the web tier's Prisma module: the hub
 * passes its own client in. Relative imports on purpose (server bundle).
 */
import type { Prisma } from '@prisma/client';
import { lockKey } from '../db/advisory-lock.server';
import { MAX_GHOSTS_PER_MEMBER, MIN_GHOST_ACCURACY, isPlausibleGhost } from './ghost';

/** The id the hub falls back to when a room has no stored passage; never a ghost. */
export const UNKNOWN_PASSAGE_ID = 'unknown';

/** The slice of a Prisma client `saveGhostIfBest` needs (the hub passes its own). */
export interface GhostDb {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

export interface GhostRunInput {
  userId: string;
  passageId: string | null | undefined;
  /** True for a passage written to order for this one run. */
  aiPassage: boolean;
  /** Length of the passage text the run was scored against. */
  passageLength: number;
  wpm: number;
  accuracy: number;
  /** The server's own measure of the run. */
  timeMs: number;
  /** What the client sent; anything that is not a believable curve is dropped. */
  samples: unknown;
}

export type GhostSaveOutcome = 'saved' | 'not-eligible' | 'implausible' | 'not-a-best';

/**
 * Keep the run's curve as the member's ghost for the passage when it is a new best.
 * Never throws for a bad curve — the run's score is unaffected, the ghost is just dropped.
 */
export async function saveGhostIfBest(db: GhostDb, run: GhostRunInput): Promise<GhostSaveOutcome> {
  const { passageId } = run;
  if (!passageId || passageId === UNKNOWN_PASSAGE_ID || run.aiPassage) return 'not-eligible';
  if (!(run.accuracy >= MIN_GHOST_ACCURACY)) return 'not-eligible';
  if (!isPlausibleGhost(run.samples, { passageLength: run.passageLength, timeMs: run.timeMs })) {
    return 'implausible';
  }
  const samples = run.samples;
  const timeMs = Math.round(run.timeMs);

  return db.$transaction(async (tx) => {
    // The cap is check-then-write, so two finishes may not both pass the check.
    await lockKey(tx, `rmhtype-ghost:${run.userId}`);
    const existing = await tx.rmhTypeGhost.findUnique({
      where: { userId_passageId: { userId: run.userId, passageId } },
      select: { wpm: true },
    });
    // A ghost never replaces a faster (or equal) one.
    if (existing && existing.wpm >= run.wpm) return 'not-a-best' as const;

    await tx.rmhTypeGhost.upsert({
      where: { userId_passageId: { userId: run.userId, passageId } },
      create: { userId: run.userId, passageId, wpm: run.wpm, timeMs, samples },
      update: { wpm: run.wpm, timeMs, samples },
    });

    if (!existing) {
      // A new passage: keep the 500 most recently raced, evict the rest.
      const keep = await tx.rmhTypeGhost.findMany({
        where: { userId: run.userId },
        orderBy: { updatedAt: 'desc' },
        skip: MAX_GHOSTS_PER_MEMBER,
        select: { passageId: true },
      });
      const evict = Array.isArray(keep) ? keep.map((r) => r.passageId) : [];
      if (evict.length > 0) {
        await tx.rmhTypeGhost.deleteMany({ where: { userId: run.userId, passageId: { in: evict } } });
      }
    }
    return 'saved' as const;
  });
}

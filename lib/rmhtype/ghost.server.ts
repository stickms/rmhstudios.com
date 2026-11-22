/**
 * RMHType ghosts — persistence. One `RmhTypeGhost` row per member per passage: the member's
 * best run on it, as a coarse progress curve (positions only; see `./ghost`).
 *
 * `saveGhostIfBest` is called by the socket hub's solo finish, which has its own Prisma client,
 * so it takes the client as a parameter. Everything else is the web tier's and uses the shared
 * one. A ghost is private: it is read and cleared by its owner only and is never in a response
 * anyone else can see.
 */
import { prisma } from '@/lib/prisma.server';
import { MAX_GHOSTS_PER_MEMBER } from '@/lib/rmhtype/ghost';
import type { RmhTypeGhost } from '@/lib/rmhtype/ghost.contract';

export { UNKNOWN_PASSAGE_ID, saveGhostIfBest } from '@/lib/rmhtype/ghost-save.server';
export type { GhostDb, GhostRunInput, GhostSaveOutcome } from '@/lib/rmhtype/ghost-save.server';

/** The caller's own ghost for a passage, or null. */
export async function getGhost(userId: string, passageId: string): Promise<RmhTypeGhost | null> {
  const row = await prisma.rmhTypeGhost.findUnique({
    where: { userId_passageId: { userId, passageId } },
    select: { passageId: true, wpm: true, timeMs: true, samples: true },
  });
  return row ?? null;
}

/** Delete every ghost the caller has. */
export async function clearGhosts(userId: string): Promise<number> {
  const { count } = await prisma.rmhTypeGhost.deleteMany({ where: { userId } });
  return count;
}

/** The member's ghosts, for the data export. Positions only, so it is small. */
export async function exportTypeGhosts(userId: string) {
  const rows = await prisma.rmhTypeGhost.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: MAX_GHOSTS_PER_MEMBER,
    select: { passageId: true, wpm: true, timeMs: true, samples: true, createdAt: true, updatedAt: true },
  });
  return Array.isArray(rows) ? rows : [];
}

/** Account deletion anonymises in place, so the ghosts are deleted explicitly. */
export function typeGhostErasureOps(userId: string) {
  return [prisma.rmhTypeGhost.deleteMany({ where: { userId } })];
}

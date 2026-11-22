/**
 * RMH Music's side of the moderation queue (Phase 6, plan §1.3). Two report entity types are
 * RMH Music's (`lib/moderation/report-schema.ts`), both removable:
 *
 * - `music-score` — a Daily challenge score on the board; the entity id is the
 *   `MusicSprintDaily` id. "Resolve & remove content" sets `hiddenAt`: the result stays the
 *   learner's (their streak and history are untouched) and it leaves every board.
 * - `music-share` — a shared result link; the entity id is the `MusicShare` id (never the token).
 *   "Resolve & remove content" sets the share's `hiddenAt`: its page and card read as gone, and
 *   the learner's result itself is untouched.
 *
 * The report route (`resolveTargetUser`) and the admin action (`takedownReportedContent`) call
 * these, so the music rules live in one place.
 */
import { prisma } from '@/lib/prisma.server';
import { invalidateBoard } from './social/board-cache.server';

/** The learner a music report is about, for triage; null when unknown or not a music type. */
export async function musicReportOwner(entityType: string, entityId: string): Promise<string | null> {
  if (entityType === 'music-score') {
    const row = await prisma.musicSprintDaily.findUnique({
      where: {
        id: entityId,
      },
      select: {
        userId: true,
      },
    });
    return row?.userId ?? null;
  }
  if (entityType === 'music-share') {
    const row = await prisma.musicShare.findUnique({
      where: {
        id: entityId,
      },
      select: {
        userId: true,
      },
    });
    return row?.userId ?? null;
  }
  return null;
}

/**
 * Take reported music content down: a score off every board, a shared link dark. Idempotent (an
 * already hidden row keeps its first time) and a row that is gone is not a failure; a real
 * database error throws, so the admin action leaves the report open.
 */
export async function hideMusicContent(entityType: string, entityId: string, now: Date = new Date()): Promise<void> {
  if (entityType === 'music-share') {
    // The page and the card read `hiddenAt` on every request; the card's HTTP cache is 10 minutes.
    await prisma.musicShare.updateMany({
      where: {
        id: entityId,
        hiddenAt: null,
      },
      data: {
        hiddenAt: now,
      },
    });
    return;
  }
  if (entityType !== 'music-score') return;
  const row = await prisma.musicSprintDaily.findUnique({
    where: {
      id: entityId,
    },
    select: {
      date: true,
    },
  });
  if (!row) return;
  await prisma.musicSprintDaily.updateMany({
    where: {
      id: entityId,
      hiddenAt: null,
    },
    data: {
      hiddenAt: now,
    },
  });
  // Off the board at once, not when the cached list expires.
  await invalidateBoard(row.date);
}

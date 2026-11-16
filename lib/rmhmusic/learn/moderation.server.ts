/**
 * RMH Music's side of the moderation queue (Phase 6, plan §1.3). Two report entity types are
 * RMH Music's (`lib/moderation/report-schema.ts`):
 *
 * - `music-score` — a Daily challenge score on the board; the entity id is the
 *   `MusicSprintDaily` id. "Resolve & remove content" sets `hiddenAt`: the result stays the
 *   learner's (their streak and history are untouched) and it leaves every board.
 * - `music-share` — a shared result link (Phase 6 PR D). Reportable already, so the shares do not
 *   need a second edit of the taxonomy; it has no owner lookup or takedown until the share table
 *   exists, and the admin page does not offer removal for it.
 *
 * The report route (`resolveTargetUser`) and the admin action (`takedownReportedContent`) call
 * these, so the music rules live in one place.
 */
import { prisma } from '@/lib/prisma.server';

/** The learner a music report is about, for triage; null when unknown or not a music type. */
export async function musicReportOwner(
  entityType: string,
  entityId: string,
): Promise<
  | string
  | null
> {
  if (
    entityType !==
    'music-score'
  )
    return null;
  const row =
    await prisma.musicSprintDaily.findUnique(
      {
        where:
          {
            id: entityId,
          },
        select:
          {
            userId: true,
          },
      },
    );
  return (
    row?.userId ??
    null
  );
}

/**
 * Take a reported music result off every board. Idempotent (an already hidden row keeps its
 * first time) and a row that is gone is not a failure; a real database error throws, so the
 * admin action leaves the report open.
 */
export async function hideMusicContent(
  entityType: string,
  entityId: string,
  now: Date = new Date(),
): Promise<void> {
  if (
    entityType !==
    'music-score'
  )
    return;
  await prisma.musicSprintDaily.updateMany(
    {
      where:
        {
          id: entityId,
          hiddenAt:
            null,
        },
      data: {
        hiddenAt:
          now,
      },
    },
  );
}

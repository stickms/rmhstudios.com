/**
 * Telling a jam's entrants that a deadline moved (s15-07). Server-only.
 *
 * After the start an admin may only add to the description and push the deadlines later (`jam-edit.ts`). When a save
 * after the start changes `submitEndsAt` or `ratingEndsAt`, everyone with a stake in the jam is told once, with the
 * new times: each entrant (`GameJamEntry.userId`) and each accepted teammate, but not an invited one and not the admin
 * who saved. Members the jam's creator blocked are still told: it is their entry. Banned members and members waiting
 * to be deleted are not, as in the other notice fan-outs. At most {@link MAX_JAM_RECIPIENTS} a save, and a save that
 * would tell more logs how many were left out. A description-only edit, and any edit before the start, tells nobody.
 *
 * The notice carries the jam's `title` and the two deadlines and nothing else: never the `theme` (a jam reveals it at
 * its start) and never a theme-vote result. Written after the save committed; a failure is logged and never fails it.
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import type { JamEditField } from '@/lib/competitive/jam-edit';

/** Most members one save can tell: written in the request, so the bound keeps it cheap. */
export const MAX_JAM_RECIPIENTS = 500;

export interface JamDeadlineMove {
  id: string;
  slug: string;
  title: string;
  /** The deadlines as stored after the save. */
  submitEndsAt: Date;
  ratingEndsAt: Date;
  /** The jam had started when the save was validated. */
  started: boolean;
  /** The fields the save changed. */
  changed: readonly JamEditField[];
}

/** Does this save move a deadline of a jam that has started? Pure. */
export function movesDeadlineAfterStart(move: Pick<JamDeadlineMove, 'started' | 'changed'>): boolean {
  return move.started && (move.changed.includes('submitEndsAt') || move.changed.includes('ratingEndsAt'));
}

/**
 * Entrants and accepted teammates (distinct, not `adminId`, not banned, not waiting to be deleted), at most
 * {@link MAX_JAM_RECIPIENTS}. Blocks are not applied: the notice is about the member's own entry, not from a person.
 */
export async function jamDeadlineRecipients(jamId: string, adminId: string): Promise<string[]> {
  const [entrants, teammates] = await Promise.all([
    prisma.gameJamEntry.findMany({
      where: { jamId },
      distinct: ['userId'],
      orderBy: { userId: 'asc' },
      take: MAX_JAM_RECIPIENTS + 1,
      select: { userId: true },
    }),
    prisma.gameJamTeamMember.findMany({
      where: { jamId, status: 'accepted' },
      distinct: ['userId'],
      orderBy: { userId: 'asc' },
      take: MAX_JAM_RECIPIENTS + 1,
      select: { userId: true },
    }),
  ]);
  const all = new Set<string>();
  for (const r of entrants) all.add(r.userId);
  for (const r of teammates) all.add(r.userId);
  all.delete(adminId);
  if (all.size === 0) return [];
  const now = new Date();
  const unavailable = await prisma.user.findMany({
    where: { id: { in: [...all] }, OR: [{ bannedUntil: { gt: now } }, { deletionScheduledAt: { not: null } }] },
    select: { id: true },
  });
  for (const u of unavailable) all.delete(u.id);
  if (all.size > MAX_JAM_RECIPIENTS) {
    // Each read stops one past the cap, so this is a lower bound on how many were left out.
    console.warn(`[jam-notices] jam ${jamId}: deadline notice capped at ${MAX_JAM_RECIPIENTS} of ${all.size}+ members`);
  }
  return [...all].slice(0, MAX_JAM_RECIPIENTS);
}

/** Tell the entrants and accepted teammates. Never throws: the save is already committed. Returns how many were told. */
export async function notifyJamDeadlineMoved(adminId: string, move: JamDeadlineMove): Promise<number> {
  if (!movesDeadlineAfterStart(move)) return 0;
  try {
    const recipients = await jamDeadlineRecipients(move.id, adminId);
    const preview = notice('jam-deadline-moved', {
      title: move.title,
      submitEndsAt: move.submitEndsAt,
      ratingEndsAt: move.ratingEndsAt,
    });
    let told = 0;
    // One after another: a burst of parallel writes would only crowd the connection pool.
    for (const userId of recipients) {
      try {
        await createNotification({
          userId,
          type: 'SYSTEM',
          entityType: 'jam_deadline',
          entityId: move.id,
          preview,
          link: `/jams/${move.slug}`,
          dedupeUnread: true,
        });
        told += 1;
      } catch (err) {
        console.error('[jam-notices] notice failed:', err);
      }
    }
    return told;
  } catch (err) {
    console.error('[jam-notices] notifyJamDeadlineMoved failed:', err);
    return 0;
  }
}

/**
 * The admin speedrun review queue's reads (sprint 10, feature 16).
 *
 * Two lists for `/admin/speedruns`: the runs waiting for a human verdict, oldest first, and the last 50 human verdicts
 * with who gave them. This is an admin review queue, not a board: it ranks nothing, shows every runner (a member who
 * hides from leaderboards still has a run an admin must judge) and is reached only through admin-guarded callers.
 */
import { prisma } from '@/lib/prisma.server';
import { games } from '@/lib/catalog';
import { userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';
import {
  SPEEDRUN_DECIDED_LIMIT,
  SPEEDRUN_QUEUE_PAGE,
  type SpeedrunQueueRow,
  type SpeedrunQueueView,
} from './queue.contract';
import { toSpeedrunMetric, toSpeedrunStatus } from './types';
import { verificationTierFor } from './verifier';

const rowSelect = {
  id: true,
  replayId: true,
  timeMs: true,
  score: true,
  status: true,
  rejectReason: true,
  reviewedById: true,
  reviewedAt: true,
  createdAt: true,
  category: { select: { game: true, name: true, version: true, metric: true } },
  user: { select: { ...userDisplaySelect, handle: true } },
} as const;

export async function listSpeedrunQueue(view: SpeedrunQueueView): Promise<SpeedrunQueueRow[]> {
  const rows =
    view === 'pending'
      ? await prisma.speedrunEntry.findMany({
          where: { status: 'pending' },
          orderBy: { createdAt: 'asc' },
          take: SPEEDRUN_QUEUE_PAGE,
          select: rowSelect,
        })
      : await prisma.speedrunEntry.findMany({
          where: { status: { in: ['verified', 'rejected'] }, reviewedAt: { not: null } },
          orderBy: { reviewedAt: 'desc' },
          take: SPEEDRUN_DECIDED_LIMIT,
          select: rowSelect,
        });

  const deciderIds = [...new Set(rows.map((r) => r.reviewedById).filter((id): id is string => id !== null))];
  const deciders = deciderIds.length
    ? await prisma.user.findMany({ where: { id: { in: deciderIds } }, select: userDisplaySelect })
    : [];
  const names = new Map(deciders.map((u) => [u.id, resolveUserDisplay(u).name]));

  return rows.map((row) => {
    const game = row.category.game;
    return {
      id: row.id,
      replayId: row.replayId,
      game,
      gameTitle: games.find((g) => g.id === game)?.title ?? game,
      categoryName: row.category.name,
      version: row.category.version,
      metric: toSpeedrunMetric(row.category.metric),
      tier: verificationTierFor(game),
      timeMs: row.timeMs,
      score: row.score,
      status: toSpeedrunStatus(row.status),
      note: row.rejectReason,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      decidedBy: row.reviewedById ? { id: row.reviewedById, name: names.get(row.reviewedById) ?? null } : null,
      runner: { id: row.user.id, name: resolveUserDisplay(row.user).name, handle: row.user.handle ?? null },
    };
  });
}

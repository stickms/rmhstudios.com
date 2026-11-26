/**
 * Reports of a market comment (s15-05). The `PredictionComment` id is the report's entity id.
 *
 * - `predictionCommentAuthor`: who a report is about (null for a missing comment).
 * - `predictionCommentReportable`: whether this reporter may report it: they can see the market, did not write it,
 *   and have not blocked (or been blocked by) its author. Everyone else gets the same answer as an unknown id.
 * - `predictionCommentPreviews`: the moderator's one line per comment (market, side held, words).
 * - `takeDownPredictionComment`: delete the row, the same delete its author can do. Idempotent.
 * - `predictionCommentTargets`: what Your reports shows for each, left out when the reporter can no longer see it.
 */
import { prisma } from '@/lib/prisma.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { visibleMarket } from '@/lib/forecasting/forecasting.server';

export async function predictionCommentAuthor(id: string): Promise<string | null> {
  const row = await prisma.predictionComment.findUnique({ where: { id }, select: { userId: true } });
  return row?.userId ?? null;
}

export type PredictionCommentTarget = { ok: true; authorId: string } | { ok: false; reason: 'missing' | 'own' };

export async function predictionCommentReportable(id: string, reporterId: string): Promise<PredictionCommentTarget> {
  const row = await prisma.predictionComment.findUnique({
    where: { id },
    select: { userId: true, predictionId: true },
  });
  if (!row) return { ok: false, reason: 'missing' };
  if (!(await visibleMarket(row.predictionId, reporterId))) return { ok: false, reason: 'missing' };
  if (row.userId === reporterId) return { ok: false, reason: 'own' };
  const blocked = await getBlockedAuthorIds(reporterId);
  if (blocked.includes(row.userId)) return { ok: false, reason: 'missing' };
  return { ok: true, authorId: row.userId };
}

/** The moderator's view of each reported comment, keyed by comment id. */
export async function predictionCommentPreviews(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await prisma.predictionComment.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, body: true, side: true, shares: true, prediction: { select: { title: true } } },
  });
  for (const r of rows) {
    const held = r.side ? ` (held ${r.shares} ${r.side})` : ' (no position)';
    out.set(r.id, `On "${r.prediction.title}"${held}: ${r.body}`);
  }
  return out;
}

export async function takeDownPredictionComment(id: string): Promise<void> {
  await prisma.predictionComment.deleteMany({ where: { id } });
}

/** One entry per comment the reporter may still see: its words and nothing else. */
export async function predictionCommentTargets(
  viewerId: string,
  ids: readonly string[],
): Promise<Array<{ id: string; body: string }>> {
  if (ids.length === 0) return [];
  const blocked = [...new Set(await getBlockedAuthorIds(viewerId))];
  return prisma.predictionComment.findMany({
    where: {
      id: { in: [...ids] },
      ...(blocked.length ? { userId: { notIn: blocked } } : {}),
      prediction: { OR: [{ status: { notIn: ['PENDING', 'DENIED'] } }, { creatorId: viewerId }] },
    },
    select: { id: true, body: true },
  });
}

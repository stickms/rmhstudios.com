/**
 * Feed controls — server logic (§17). Record/remove reader tuning signals and
 * read them for the timeline (mute-tag filter) and the settings surface.
 * `less_author` demotion in ranking is a follow-up; the signal is recorded and
 * surfaced now.
 */
import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import type { FeedSignalKind, FeedSignalsView } from '@/lib/feed/signals';

const CACHE_TTL = 60_000;
const key = (userId: string) => `feed-signals:${userId}`;

export async function recordSignal(
  userId: string,
  kind: FeedSignalKind,
  targetId: string,
): Promise<void> {
  await prisma.feedSignal.upsert({
    where: { userId_kind_targetId: { userId, kind, targetId } },
    create: { userId, kind, targetId },
    update: {},
  });
  void invalidateCached(key(userId));
}

export async function removeSignal(
  userId: string,
  kind: FeedSignalKind,
  targetId: string,
): Promise<void> {
  await prisma.feedSignal.deleteMany({ where: { userId, kind, targetId } });
  void invalidateCached(key(userId));
}

export async function getSignals(userId: string | null): Promise<FeedSignalsView> {
  const empty: FeedSignalsView = { lessAuthors: [], mutedTags: [], followedTags: [] };
  if (!userId) return empty;
  return cached(
    key(userId),
    CACHE_TTL,
    async () => {
      const rows = await prisma.feedSignal.findMany({
        where: { userId },
        select: { kind: true, targetId: true },
      });
      const view: FeedSignalsView = { lessAuthors: [], mutedTags: [], followedTags: [] };
      for (const r of rows) {
        if (r.kind === 'less_author') view.lessAuthors.push(r.targetId);
        else if (r.kind === 'mute_tag') view.mutedTags.push(r.targetId);
        else if (r.kind === 'follow_tag') view.followedTags.push(r.targetId);
      }
      return view;
    },
    { l2: false },
  );
}

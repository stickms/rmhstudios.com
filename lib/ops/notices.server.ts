import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import type { CreateNoticeInput } from './schema';

const ACTIVE_KEY = 'ops:notices:active';
const NEW_MEMBER_MS = 7 * 86_400_000;

interface ActiveNotice {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  segment: string;
  segmentValue: string | null;
}

async function activeNotices(): Promise<ActiveNotice[]> {
  const hit = apiCache.get<ActiveNotice[]>(ACTIVE_KEY);
  if (hit) return hit;
  const now = new Date();
  const rows = await prisma.targetedNotice.findMany({
    where: {
      archivedAt: null,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, title: true, body: true, linkUrl: true, segment: true, segmentValue: true },
  });
  apiCache.set(ACTIVE_KEY, rows, 60_000);
  return rows;
}

/** The newest undismissed notice this member matches, or null. */
export async function noticeFor(userId: string, locale: string | undefined) {
  const notices = await activeNotices();
  if (notices.length === 0) return null;
  const dismissed = new Set(
    (
      await prisma.targetedNoticeDismissal.findMany({
        where: { userId, noticeId: { in: notices.map((n) => n.id) } },
        select: { noticeId: true },
      })
    ).map((d) => d.noticeId),
  );
  const createdAt = notices.some((n) => n.segment === 'new')
    ? (await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }))
        ?.createdAt
    : undefined;
  for (const n of notices) {
    if (dismissed.has(n.id)) continue;
    if (n.segment === 'new' && !(createdAt && Date.now() - createdAt.getTime() < NEW_MEMBER_MS))
      continue;
    if (n.segment === 'locale' && n.segmentValue !== locale) continue;
    if (n.segment === 'game') {
      // "Players" = anyone with a play status on the game (arcade backlog) or a PLAYED activity.
      const gameId = n.segmentValue ?? '';
      const played =
        (await prisma.gamePlayStatus.findUnique({
          where: { userId_gameId: { userId, gameId } },
          select: { id: true },
        })) ??
        (await prisma.activity.findFirst({
          where: { userId, verb: 'PLAYED', kind: 'game', entityId: gameId },
          select: { id: true },
        }));
      if (!played) continue;
    }
    return { id: n.id, title: n.title, body: n.body, linkUrl: n.linkUrl };
  }
  return null;
}

export async function dismissNotice(userId: string, noticeId: string): Promise<boolean> {
  const exists = await prisma.targetedNotice.findUnique({
    where: { id: noticeId },
    select: { id: true },
  });
  if (!exists) return false;
  await prisma.targetedNoticeDismissal.createMany({
    data: [{ noticeId, userId }],
    skipDuplicates: true,
  });
  return true;
}

export async function createNotice(adminId: string, input: CreateNoticeInput) {
  const row = await prisma.targetedNotice.create({
    data: {
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl,
      segment: input.segment,
      segmentValue: input.segment === 'all' || input.segment === 'new' ? null : input.segmentValue,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      createdById: adminId,
    },
  });
  apiCache.invalidate(ACTIVE_KEY);
  return row;
}

export async function archiveNotice(id: string) {
  const res = await prisma.targetedNotice.updateMany({
    where: { id, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  apiCache.invalidate(ACTIVE_KEY);
  return res.count > 0;
}

export async function listNotices() {
  const rows = await prisma.targetedNotice.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { _count: { select: { dismissals: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    linkUrl: r.linkUrl,
    segment: r.segment,
    segmentValue: r.segmentValue,
    endsAt: r.endsAt?.toISOString() ?? null,
    archived: r.archivedAt !== null,
    createdAt: r.createdAt.toISOString(),
    dismissed: r._count.dismissals,
  }));
}

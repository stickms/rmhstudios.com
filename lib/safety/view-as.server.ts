/**
 * S5 "view as member" — server-only, read-only. Assembles what the site would
 * show a given member (their entitlements, mutes/blocks, and the first page of
 * their For-You feed as the same timeline function renders it) WITHOUT any
 * session impersonation: the admin's own session is the only identity in play,
 * and the caller writes the AdminAuditLog row before this runs.
 */
import { prisma } from '@/lib/prisma.server';
import { getUserTier } from '@/lib/entitlements';
import { getTimeline } from '@/lib/feed/timeline';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

const LIST_CAP = 50;
const FEED_CAP = 10;

export async function findMemberForViewAs(query: string): Promise<{ id: string } | null> {
  const q = query.trim().replace(/^@/, '');
  if (!q) return null;
  return prisma.user.findFirst({
    where: { OR: [{ id: q }, { handle: { equals: q, mode: 'insensitive' } }] },
    select: { id: true },
  });
}

export async function viewAsMember(userId: string) {
  const [user, tier, mutes, blocksOut, blocksIn, feed] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { ...userDisplaySelect, createdAt: true, bannedUntil: true, banReason: true },
    }),
    getUserTier(userId),
    prisma.userMute.findMany({
      where: { muterId: userId },
      take: LIST_CAP,
      select: { muted: { select: userDisplaySelect } },
    }),
    prisma.userBlock.findMany({
      where: { blockerId: userId },
      take: LIST_CAP,
      select: { blocked: { select: userDisplaySelect } },
    }),
    prisma.userBlock.findMany({
      where: { blockedId: userId },
      take: LIST_CAP,
      select: { blocker: { select: userDisplaySelect } },
    }),
    getTimeline({
      userId,
      surface: 'foryou',
      filter: 'all',
      cursor: null,
      limit: FEED_CAP,
      search: null,
    }),
  ]);
  if (!user) return null;
  const brief = (u: Parameters<typeof resolveUser>[0]) => {
    const r = resolveUser(u);
    return { id: r.id, name: r.name ?? null, handle: r.handle ?? null };
  };
  return {
    member: {
      ...brief(user),
      createdAt: user.createdAt.toISOString(),
      isAdmin: user.isAdmin,
      bannedUntil: user.bannedUntil?.toISOString() ?? null,
      banReason: user.banReason ?? null,
    },
    entitlements: { tier },
    mutes: mutes.map((m) => brief(m.muted)),
    blocks: blocksOut.map((b) => brief(b.blocked)),
    blockedBy: blocksIn.map((b) => brief(b.blocker)),
    mutedWords: feed.mutedWords ?? [],
    feed: feed.items.map((i) => ({
      id: i.id,
      type: i.type,
      createdAt: i.createdAt,
      author: i.user?.handle || i.user?.name || null,
      text: (i.content ?? '').slice(0, 160),
    })),
  };
}

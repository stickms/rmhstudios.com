import { prisma } from '@/lib/prisma.server';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import { MADE_PER_KIND, type MadeItem, type MadeKind } from '@/lib/profile/made';

/**
 * What a member has made, for the "Made here" profile module (sprint 12, feature 07).
 *
 * Five bounded queries run together, one per kind, each with the rule that keeps unfinished, hidden, private and
 * moderated work out; every row is mapped to one shape. The one visibility rule per kind:
 *
 * - Connections grid: not a draft, not hidden by a moderator.
 * - Lights Out board: not hidden.
 * - Flashcard deck: public, not locked by a moderator, with at least one card.
 * - Slice It chart: `status` public (legacy rows still say ranked) on a song that is public and not taken down (an
 *   archived song stays in the library, as the library itself treats it).
 * - Build: PUBLIC with a `publishedAt`; an UNLISTED or PRIVATE build is never listed.
 *
 * Nothing here reads a post count. The figures are plays, cards, a chart's tier and a build's releases.
 */

/** `null` means the caller answers 404: nobody to show, or a pair that cannot see each other. */
export async function madeBy(
  profileUserId: string,
  viewerId: string | null,
  kinds: readonly MadeKind[],
): Promise<MadeItem[] | null> {
  const isOwner = viewerId === profileUserId;
  const now = new Date();

  const person = await prisma.user.findUnique({
    where: { id: profileUserId },
    select: { id: true, banReason: true, bannedUntil: true, deletionScheduledAt: true },
  });
  if (!person) return null;
  // A tombstone shows no module to anyone; a banned or about-to-be-deleted account only to its owner.
  if (person.banReason === DELETED_ACCOUNT_BAN_REASON) return null;
  if (!isOwner) {
    if (person.deletionScheduledAt) return null;
    if (person.bannedUntil && person.bannedUntil > now) return null;
    if (viewerId) {
      const block = await prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: profileUserId },
            { blockerId: profileUserId, blockedId: viewerId },
          ],
        },
        select: { blockerId: true },
      });
      if (block) return null;
    }
  }

  const want = new Set(kinds);
  const take = MADE_PER_KIND;
  const [grids, boards, decks, charts, builds] = await Promise.all([
    want.has('connections')
      ? prisma.connectionsGrid.findMany({
          where: { authorId: profileUserId, draft: false, hidden: false },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, title: true, playCount: true },
        })
      : [],
    want.has('lights-out')
      ? prisma.lightsOutBoard.findMany({
          where: { authorId: profileUserId, hidden: false },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, title: true, playCount: true },
        })
      : [],
    want.has('deck')
      ? prisma.flashcardDeck.findMany({
          where: { userId: profileUserId, isPublic: true, moderatedAt: null, cardCount: { gt: 0 } },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, title: true, cardCount: true },
        })
      : [],
    want.has('chart')
      ? prisma.chart.findMany({
          where: {
            authorId: profileUserId,
            status: { in: ['public', 'ranked'] },
            song: { isPublic: true, takenDownAt: null },
          },
          orderBy: { updatedAt: 'desc' },
          take,
          select: { id: true, difficulty: true, song: { select: { title: true } } },
        })
      : [],
    want.has('build')
      ? prisma.userBuild.findMany({
          where: { userId: profileUserId, visibility: 'PUBLIC', publishedAt: { not: null } },
          orderBy: { publishedAt: 'desc' },
          take,
          select: { id: true, slug: true, title: true, _count: { select: { versions: true } } },
        })
      : [],
  ]);

  const items: MadeItem[] = [];
  for (const g of grids) {
    items.push({
      kind: 'connections',
      id: g.id,
      title: g.title,
      href: `/connections/u/${g.id}`,
      figure: { unit: 'plays', value: g.playCount },
    });
  }
  for (const b of boards) {
    items.push({
      kind: 'lights-out',
      id: b.id,
      title: b.title,
      href: `/lights-out/b/${b.id}`,
      figure: { unit: 'plays', value: b.playCount },
    });
  }
  for (const d of decks) {
    items.push({
      kind: 'deck',
      id: d.id,
      title: d.title,
      href: `/study/${d.id}`,
      figure: { unit: 'cards', value: d.cardCount },
    });
  }
  for (const c of charts) {
    items.push({
      kind: 'chart',
      id: c.id,
      title: c.song.title,
      // No page exists for one chart; the library finds the song by its title.
      href: `/slice-it?q=${encodeURIComponent(c.song.title)}`,
      figure: { unit: 'difficulty', value: c.difficulty },
    });
  }
  for (const b of builds) {
    items.push({
      kind: 'build',
      id: b.id,
      title: b.title,
      href: `/builds/${b.slug}`,
      figure: { unit: 'releases', value: b._count.versions },
    });
  }
  return items;
}

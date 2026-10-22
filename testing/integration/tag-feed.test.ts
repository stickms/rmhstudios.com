/**
 * The hashtag feed's raw-SQL privacy rules, executed on a real Postgres.
 *
 * `listTagFeed` picks a page's ids with one hand-written query (audience rule,
 * private-community rule, hidden authors, keyset cursor). The unit test can only
 * assert that SQL text; a clause that reads right and filters wrong (an expiry
 * compared the wrong way, a NOT EXISTS that never matches) passes it. Here every
 * audience, a private community and a block are seeded for real and each viewer
 * is asked what they can see.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma.server';
import { listTagFeed } from '@/lib/tags.server';
import { deleteUsers, seedUsers, uniq } from './lib/seed';

type Aud = 'PUBLIC' | 'FOLLOWERS' | 'SUPPORTERS' | 'CIRCLE' | 'PRIVATE';

const tag = uniq('tag').replace(/[^a-z0-9]/g, '');
let ids: string[] = [];
const u: Record<string, string> = {};
const post: Record<string, string> = {};

const NAMES = [
  'author', 'author2', 'stranger', 'follower', 'supporter', 'lapsed', 'circle', 'member', 'blocker', 'blocked',
] as const;

// Newest first. Visible and hidden posts are interleaved so a page of 2 has to skip
// hidden rows to fill itself - the case a keyset-with-filter query can get wrong.
const POSTS: { key: string; by: 'author' | 'author2'; audience: Aud; community?: boolean; deleted?: boolean }[] = [
  { key: 'private', by: 'author', audience: 'PRIVATE' },
  { key: 'pub1', by: 'author', audience: 'PUBLIC' },
  { key: 'followers', by: 'author', audience: 'FOLLOWERS' },
  { key: 'supporters', by: 'author', audience: 'SUPPORTERS' },
  { key: 'deleted', by: 'author', audience: 'PUBLIC', deleted: true },
  { key: 'pub2', by: 'author', audience: 'PUBLIC' },
  { key: 'circle', by: 'author', audience: 'CIRCLE' },
  { key: 'community', by: 'author', audience: 'PUBLIC', community: true },
  { key: 'pub3', by: 'author', audience: 'PUBLIC' },
  { key: 'a2pub', by: 'author2', audience: 'PUBLIC' },
];

beforeAll(async () => {
  ids = await seedUsers('tag', NAMES.length);
  NAMES.forEach((n, i) => (u[n] = ids[i]));

  const community = await prisma.community.create({
    data: {
      slug: uniq('priv'),
      name: 'integration private',
      isPrivate: true,
      createdById: u.author,
      members: { create: [{ userId: u.author, role: 'ADMIN' }, { userId: u.member }] },
    },
  });

  const hashtag = await prisma.hashtag.create({ data: { tag, postCount: POSTS.length } });
  const base = Date.now() - 3_600_000;
  for (const [i, p] of POSTS.entries()) {
    const createdAt = new Date(base - i * 60_000);
    const row = await prisma.rMHark.create({
      data: {
        userId: u[p.by],
        content: `#${tag} ${p.key}`,
        audience: p.audience,
        communityId: p.community ? community.id : null,
        deletedAt: p.deleted ? new Date() : null,
        createdAt,
      },
    });
    post[p.key] = row.id;
    await prisma.postHashtag.create({ data: { hashtagId: hashtag.id, rmheetId: row.id, createdAt } });
  }

  await prisma.follow.create({ data: { followerId: u.follower, followingId: u.author } });
  await prisma.closeFriend.create({ data: { ownerId: u.author, memberId: u.circle } });
  const day = 86_400_000;
  await prisma.creatorMembership.createMany({
    data: [
      { creatorId: u.author, supporterId: u.supporter, priceCoins: 1, expiresAt: new Date(Date.now() + day) },
      { creatorId: u.author, supporterId: u.lapsed, priceCoins: 1, expiresAt: new Date(Date.now() - day) },
    ],
  });
  // `blocker` blocked author2; author blocked `blocked` (so `blocked` is hidden the other way round).
  await prisma.userBlock.createMany({
    data: [
      { blockerId: u.blocker, blockedId: u.author2 },
      { blockerId: u.author, blockedId: u.blocked },
    ],
  });
});

afterAll(async () => {
  await prisma.hashtag.deleteMany({ where: { tag } }); // cascades the links
  await deleteUsers(ids); // cascades posts, community, follows, memberships, blocks
  await prisma.$disconnect();
});

const seen = async (viewerId: string | null) => {
  const feed = await listTagFeed(tag, { viewerId, limit: 50 });
  return feed.items.map((i) => i.id);
};
const keys = (...ks: string[]) => ks.map((k) => post[k]);
// POSTS order is the feed order; compare as ordered lists.
const expectFeed = async (viewerId: string | null, visible: string[]) => {
  const order = POSTS.map((p) => p.key).filter((k) => visible.includes(k));
  expect(await seen(viewerId)).toEqual(keys(...order));
};

describe('listTagFeed visibility on a real database', () => {
  it('signed-out and strangers see PUBLIC only - not the private community post, not deleted', async () => {
    await expectFeed(null, ['pub1', 'pub2', 'pub3', 'a2pub']);
    await expectFeed(u.stranger, ['pub1', 'pub2', 'pub3', 'a2pub']);
  });

  it('a follower additionally sees FOLLOWERS', async () => {
    await expectFeed(u.follower, ['pub1', 'followers', 'pub2', 'pub3', 'a2pub']);
  });

  it('an ACTIVE supporter sees SUPPORTERS; a lapsed membership does not', async () => {
    await expectFeed(u.supporter, ['pub1', 'supporters', 'pub2', 'pub3', 'a2pub']);
    await expectFeed(u.lapsed, ['pub1', 'pub2', 'pub3', 'a2pub']);
  });

  it('a circle member sees CIRCLE; PRIVATE is the author only', async () => {
    await expectFeed(u.circle, ['pub1', 'pub2', 'circle', 'pub3', 'a2pub']);
    expect(await seen(u.circle)).not.toContain(post.private);
    expect(await seen(u.follower)).not.toContain(post.private);
  });

  it('a private community post is for members only', async () => {
    await expectFeed(u.member, ['pub1', 'pub2', 'community', 'pub3', 'a2pub']);
    expect(await seen(u.stranger)).not.toContain(post.community);
    expect(await seen(u.follower)).not.toContain(post.community);
  });

  it('the author sees all of their own live posts, including PRIVATE', async () => {
    await expectFeed(u.author, ['private', 'pub1', 'followers', 'supporters', 'pub2', 'circle', 'community', 'pub3', 'a2pub']);
  });

  it('a block hides the author in both directions', async () => {
    // blocker blocked author2: author2's PUBLIC post is gone for them, author's remain.
    await expectFeed(u.blocker, ['pub1', 'pub2', 'pub3']);
    // author blocked `blocked`: none of author's posts reach them.
    await expectFeed(u.blocked, ['a2pub']);
  });
});

describe('listTagFeed cursor pagination on a real database', () => {
  const pageThrough = async (viewerId: string | null, limit: number) => {
    const got: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const page = await listTagFeed(tag, { viewerId, limit, cursor });
      got.push(...page.items.map((i) => i.id));
      expect(page.hasMore).toBe(page.nextCursor !== null);
      if (!page.hasMore) return got;
      cursor = page.nextCursor;
    }
    throw new Error('cursor never terminated');
  };

  it.each([
    ['author', 2, ['private', 'pub1', 'followers', 'supporters', 'pub2', 'circle', 'community', 'pub3', 'a2pub']],
    ['follower', 2, ['pub1', 'followers', 'pub2', 'pub3', 'a2pub']],
    ['stranger', 1, ['pub1', 'pub2', 'pub3', 'a2pub']],
    ['supporter', 3, ['pub1', 'supporters', 'pub2', 'pub3', 'a2pub']],
  ] as const)('%s paging by %i returns each visible post exactly once, in order', async (who, limit, visible) => {
    expect(await pageThrough(u[who], limit)).toEqual(keys(...visible));
  });

  it('signed-out paging is PUBLIC-only and complete', async () => {
    expect(await pageThrough(null, 2)).toEqual(keys('pub1', 'pub2', 'pub3', 'a2pub'));
  });
});

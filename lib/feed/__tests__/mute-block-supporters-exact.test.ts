/**
 * Review items 1, 2 and 5 on the visibility helpers.
 *
 *  1. A MUTE only filters feeds; it must not make a post unreadable. Blocks (both
 *     directions) still deny reads. `canReadThread` and `viewerVisiblePostWhere`
 *     agree with `canViewPost`.
 *  2. A SUPPORTERS-only post is visible to its active supporters through
 *     `viewerVisiblePostWhere` (bookmarks, saves, thread, profile tabs).
 *  5. FOLLOWERS visibility is exact: it does not depend on the capped follow list
 *     (`getFollowingIds` keeps 5,000), so an old follow still sees the post.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evalWhere, withAuthorGraph, type Row } from './where-eval';

const s = vi.hoisted(() => ({
  muted: [] as string[],
  blocked: [] as string[],
  following: [] as string[],
  supported: [] as string[],
  circles: [] as string[],
}));

vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => [...s.muted, ...s.blocked],
  getBlockedAuthorIds: async () => s.blocked,
}));
// The capped list is empty here, as it would be for the viewer's oldest follows.
// Visibility must hold anyway: the follow lives in the relation row.
vi.mock('@/lib/social/follow-graph.server', () => ({ getFollowingIds: async () => [] }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    closeFriend: { findUnique: async () => null, findMany: async () => [] },
    creatorMembership: { findUnique: async () => null, findMany: async () => [] },
    follow: { findUnique: async () => null },
    community: { findUnique: async () => null },
  },
}));

import { canReadThread, viewerVisiblePostWhere } from '../audience.server';

const VIEWER = 'viewer';
const post = () => ({
  userId: 'author',
  audience: 'PUBLIC' as const,
  deletedAt: null,
  communityId: null,
});

async function visible(rows: Row[], opts?: { hideMuted?: boolean }): Promise<string[]> {
  const where = await viewerVisiblePostWhere(VIEWER, opts);
  return rows
    .map((r) => withAuthorGraph(r, VIEWER, s))
    .filter((r) => evalWhere(r, where))
    .map((r) => r.id as string);
}

beforeEach(() => {
  Object.assign(s, { muted: [], blocked: [], following: [], supported: [], circles: [] });
});

describe('mute vs block (item 1)', () => {
  it('canReadThread still reads a muted author, denies a blocked one', async () => {
    s.muted = ['author'];
    expect(await canReadThread(post(), VIEWER)).toBe(true);
    s.muted = [];
    s.blocked = ['author'];
    expect(await canReadThread(post(), VIEWER)).toBe(false);
  });

  it('viewerVisiblePostWhere keeps muted authors, drops blocked ones', async () => {
    const rows = [
      { id: 'by-muted', userId: 'muted', audience: 'PUBLIC', deletedAt: null },
      { id: 'by-blocked', userId: 'blocked', audience: 'PUBLIC', deletedAt: null },
    ];
    s.muted = ['muted'];
    s.blocked = ['blocked'];
    expect(await visible(rows)).toEqual(['by-muted']);
  });
});

describe('feed callers keep hiding muted authors (hideMuted)', () => {
  it('community feed / hall of fame / list timeline drop muted authors too', async () => {
    const rows = [
      { id: 'by-muted', userId: 'muted', audience: 'PUBLIC', deletedAt: null },
      { id: 'by-blocked', userId: 'blocked', audience: 'PUBLIC', deletedAt: null },
      { id: 'ok', userId: 'ok', audience: 'PUBLIC', deletedAt: null },
    ];
    s.muted = ['muted'];
    s.blocked = ['blocked'];
    expect(await visible(rows, { hideMuted: true })).toEqual(['ok']);
    expect(await visible(rows)).toEqual(['by-muted', 'ok']);

    // And the clause itself: feeds exclude exactly the muted + blocked ids, plain
    // reads exclude only the blocked ones (so a dropped `notIn` cannot pass on row luck).
    const feedWhere = (await viewerVisiblePostWhere(VIEWER, { hideMuted: true })) as {
      userId?: { notIn: string[] };
    };
    expect([...(feedWhere.userId?.notIn ?? [])].sort()).toEqual(['blocked', 'muted']);
    const readWhere = (await viewerVisiblePostWhere(VIEWER)) as { userId?: { notIn: string[] } };
    expect(readWhere.userId?.notIn).toEqual(['blocked']);
  });
});

describe('supporters-only posts (item 2)', () => {
  const rows = [
    { id: 'sup-a', userId: 'a', audience: 'SUPPORTERS', deletedAt: null },
    { id: 'sup-b', userId: 'b', audience: 'SUPPORTERS', deletedAt: null },
  ];
  it('shows them to an active supporter of the author only', async () => {
    s.supported = ['a'];
    expect(await visible(rows)).toEqual(['sup-a']);
  });
  it('shows them to nobody who supports no one', async () => {
    expect(await visible(rows)).toEqual([]);
  });
});

describe('exact follower check (item 5)', () => {
  it('does not depend on the capped follow list', async () => {
    s.following = ['old-follow'];
    const rows = [
      { id: 'f-old', userId: 'old-follow', audience: 'FOLLOWERS', deletedAt: null },
      { id: 'f-other', userId: 'stranger', audience: 'FOLLOWERS', deletedAt: null },
    ];
    expect(await visible(rows)).toEqual(['f-old']);
  });
});

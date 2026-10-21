/**
 * `viewerVisiblePostWhere` - the visibility rule for a post reached THROUGH
 * another row: a profile's Likes tab and a profile's reposts.
 *
 * Both used to return the underlying post with no visibility check at all
 * (reposts checked only `deletedAt`, likes checked nothing), so opening someone's
 * profile revealed the PRIVATE, FOLLOWERS-only and CIRCLE posts they had liked or
 * reposted, and the text of posts that had been deleted. Asserted on the rows the
 * `where` selects, not on its shape.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evalWhere, type Row } from './where-eval';

const state = vi.hoisted(() => ({
  following: [] as string[],
  circles: [] as string[],
  hidden: [] as string[],
}));

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/social/follow-graph.server', () => ({
  getFollowingIds: vi.fn(async () => state.following),
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: vi.fn(async () => state.hidden),
}));

import { viewerVisiblePostWhere } from '../audience.server';

// `circleOwnerIds` lives in the module under test and reads Prisma; give it the
// one table it touches.
import { prisma } from '@/lib/prisma.server';
(prisma as unknown as Record<string, unknown>).closeFriend = {
  findMany: vi.fn(async () => state.circles.map((ownerId) => ({ ownerId }))),
};

const VIEWER = 'viewer';

function liked(id: string, over: Row): Row {
  return {
    id: `like-${id}`,
    rmhark: { id, userId: 'author', audience: 'PUBLIC', deletedAt: null, ...over },
  };
}

async function visibleIds(viewerId: string | null, rows: Row[]): Promise<string[]> {
  const where = { rmhark: await viewerVisiblePostWhere(viewerId) };
  return rows.filter((r) => evalWhere(r, where)).map((r) => (r.rmhark as { id: string }).id);
}

const rows = [
  liked('public', {}),
  liked('private', { audience: 'PRIVATE' }),
  liked('followers', { audience: 'FOLLOWERS' }),
  liked('followers-of-friend', { audience: 'FOLLOWERS', userId: 'friend' }),
  liked('circle', { audience: 'CIRCLE' }),
  liked('circle-of-friend', { audience: 'CIRCLE', userId: 'friend' }),
  liked('deleted', { deletedAt: new Date() }),
  liked('mine-private', { audience: 'PRIVATE', userId: VIEWER }),
  liked('by-blocked', { userId: 'blocked' }),
];

beforeEach(() => {
  state.following = ['friend'];
  state.circles = [];
  state.hidden = [];
});

describe('viewerVisiblePostWhere', () => {
  it('anonymous viewers see public, live posts only', async () => {
    expect(await visibleIds(null, rows)).toEqual(['public', 'by-blocked']);
  });

  it('a signed-in viewer sees public posts, their own, and followed authors FOLLOWERS posts', async () => {
    expect(await visibleIds(VIEWER, rows)).toEqual([
      'public',
      'followers-of-friend',
      'mine-private',
      'by-blocked',
    ]);
  });

  it('never reveals PRIVATE, deleted, or other authors FOLLOWERS posts', async () => {
    const seen = await visibleIds(VIEWER, rows);
    for (const id of ['private', 'followers', 'deleted', 'circle']) {
      expect(seen).not.toContain(id);
    }
  });

  it('shows a CIRCLE post only to a member of that author circle', async () => {
    state.circles = ['friend'];
    const seen = await visibleIds(VIEWER, rows);
    expect(seen).toContain('circle-of-friend');
    expect(seen).not.toContain('circle');
  });

  it('hides authors the viewer blocked, muted, or was blocked by', async () => {
    state.hidden = ['blocked'];
    expect(await visibleIds(VIEWER, rows)).not.toContain('by-blocked');
  });
});

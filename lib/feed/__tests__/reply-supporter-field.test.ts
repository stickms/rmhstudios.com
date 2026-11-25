/**
 * The `supporter` field on replies (sprint 14 #13): present and `true` only for the post's author, only on replies from
 * their active supporters. For every other viewer the key is absent (not `false`), so two responses cannot be compared,
 * and the response is never given a shared-cache policy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { assertJsonSafe } from '@/lib/db/query-shape';

const h = vi.hoisted(() => ({
  viewer: null as string | null,
  switchOn: true,
  membershipReads: 0,
  activeSupporters: ['supporter'] as string[],
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => (h.viewer ? { user: { id: h.viewer }, session: {} } : null),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/feed/audience.server', () => ({
  canReadPostThread: async () => true,
  canReadThread: async () => true,
}));

const reply = (id: string, userId: string, parentId: string | null = null) => ({
  id,
  content: `reply ${id}`,
  createdAt: new Date('2026-12-01T10:00:00Z'),
  updatedAt: new Date('2026-12-01T10:00:00Z'),
  rmheetId: 'p1',
  parentId,
  userId,
  user: { id: userId, name: userId, image: null, username: userId, handle: userId },
  likeCount: 0,
  replyCount: 0,
  deletedAt: null,
  deletedByAdmin: false,
  hiddenAt: null,
  _count: { reposts: 0, views: 0 },
  reactions: [],
});

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    rMHark: { findUnique: async () => ({ userId: 'creator' }) },
    rMHarkComment: {
      findMany: async () => [reply('c1', 'supporter'), reply('c2', 'stranger'), reply('c3', 'creator')],
    },
    userProfile: { findUnique: async () => ({ showSupporterMarks: h.switchOn }) },
    creatorMembership: {
      findMany: async (args: { where: { supporterId: { in: string[] } } }) => {
        h.membershipReads += 1;
        return args.where.supporterId.in
          .filter((id) => h.activeSupporters.includes(id))
          .map((supporterId) => ({ supporterId }));
      },
    },
    $queryRaw: async () => [],
  }),
}));

import { route } from '@/lib/feed/api/rmharks.$id.comment.server';

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
type Row = { id: string; supporter?: unknown; replies: Row[] };

async function read(viewer: string | null): Promise<{ rows: Row[]; res: Response }> {
  h.viewer = viewer;
  const res = await handlersOf<Handler>(route).GET({
    request: new Request('https://x.test/api/rmharks/p1/comment', {
      headers: { 'cf-connecting-ip': '1.1.1.1', cookie: 'better-auth.session_token=t' },
    }),
    params: { id: 'p1' },
  });
  const rows = (await res.json()) as Row[];
  assertJsonSafe(rows);
  return { rows, res };
}

beforeEach(() => {
  h.viewer = null;
  h.switchOn = true;
  h.membershipReads = 0;
  h.activeSupporters = ['supporter'];
});

describe('GET /api/rmharks/:id/comment, supporter field', () => {
  it('marks only the replies from active supporters, for the post author', async () => {
    const { rows } = await read('creator');
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.c1?.supporter).toBe(true);
    expect('supporter' in (byId.c2 as Row)).toBe(false);
    // The author's own reply is not a supporter mark.
    expect('supporter' in (byId.c3 as Row)).toBe(false);
  });

  it.each([
    ['signed out', null],
    ['a supporter', 'supporter'],
    ['another replier', 'stranger'],
  ])('has no supporter key anywhere for %s', async (_name, viewer) => {
    const { rows } = await read(viewer);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(Object.keys(row)).not.toContain('supporter');
    expect(JSON.stringify(rows)).not.toContain('"supporter":');
    expect(h.membershipReads).toBe(0);
  });

  it('has no supporter key for the author with the switch off, and looks up no memberships', async () => {
    h.switchOn = false;
    const { rows } = await read('creator');
    for (const row of rows) expect(Object.keys(row)).not.toContain('supporter');
    expect(h.membershipReads).toBe(0);
  });

  it('leaves out an expired or absent membership (the author sees no mark)', async () => {
    h.activeSupporters = [];
    const { rows } = await read('creator');
    for (const row of rows) expect(Object.keys(row)).not.toContain('supporter');
  });

  it('makes one membership read for the page', async () => {
    await read('creator');
    expect(h.membershipReads).toBe(1);
  });

  it('is never given a shared-cache policy, since the author sees a different body', async () => {
    for (const viewer of ['creator', 'stranger', null]) {
      const { res } = await read(viewer);
      const cc = res.headers.get('Cache-Control');
      expect(cc === null || /private|no-store/.test(cc)).toBe(true);
    }
  });
});

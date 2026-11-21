/**
 * Who may browse a member's followers and following lists (sprint 04 #18).
 *
 * One function, `canSeeFollowLists`, is the answer for the two site endpoints, the two developer-API endpoints, the
 * Steam-style profile's friends row and the "Followed by" suggestion lines; every list shown also drops accounts in
 * a blocked pair with the viewer. Prisma is a small in-memory fake.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { FOLLOW_LIST_READ_PATHS } from '@/lib/social/follow-list-privacy';

type Edge = { followerId: string; followingId: string };

const db = vi.hoisted(() => ({
  viewer: null as string | null,
  visibility: new Map<string, string>(),
  edges: [] as { followerId: string; followingId: string }[],
  admins: new Set<string>(),
  blocks: [] as { blockerId: string; blockedId: string }[],
  handles: { owner: 'owner-id' } as Record<string, string>,
}));

const person = (id: string) => ({
  id,
  name: id,
  username: null,
  handle: id,
  image: null,
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: null,
});

const inSet = (v: unknown, id: string) =>
  typeof v === 'string' ? v === id : Array.isArray((v as { in?: string[] })?.in) && (v as { in: string[] }).in.includes(id);

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => (db.viewer ? { user: { id: db.viewer }, session: {} } : null),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/api/with-developer-api.server', () => ({
  apiOptions: () => new Response(null),
  withDeveloperApi: async (
    _req: Request,
    fn: (c: {
      userId: string | null;
      json: (b: unknown, s?: number) => Response;
      error: (c: string, m: string, s: number) => Response;
    }) => Promise<Response>,
  ) =>
    fn({
      userId: db.viewer,
      json: (b, s = 200) => Response.json(b, { status: s }),
      error: (code, m, s) => Response.json({ error: { code, message: m } }, { status: s }),
    }),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id?: string; handle?: string } }) => {
        if (where.handle !== undefined) {
          const id = db.handles[where.handle];
          return id ? { id } : null;
        }
        return where.id ? { isAdmin: db.admins.has(where.id) } : null;
      },
    },
    userProfile: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        db.visibility.has(where.userId) ? { followListVisibility: db.visibility.get(where.userId) } : null,
    },
    follow: {
      findUnique: async ({ where }: { where: { followerId_followingId: Edge } }) => {
        const k = where.followerId_followingId;
        return db.edges.some((e) => e.followerId === k.followerId && e.followingId === k.followingId)
          ? { id: 'e' }
          : null;
      },
      findMany: async ({ where }: { where: { followerId?: unknown; followingId?: unknown } }) =>
        db.edges
          .filter(
            (e) =>
              (where.followerId === undefined || inSet(where.followerId, e.followerId)) &&
              (where.followingId === undefined || inSet(where.followingId, e.followingId)),
          )
          .map((e, i) => ({
            id: `f${i}`,
            createdAt: new Date(2026, 0, 1 + i),
            followerId: e.followerId,
            followingId: e.followingId,
            follower: person(e.followerId),
            following: person(e.followingId),
          })),
    },
    userBlock: {
      findMany: async ({ where }: { where: { OR: { blockerId: unknown; blockedId: unknown }[] } }) =>
        db.blocks.filter((b) => where.OR.some((c) => inSet(c.blockerId, b.blockerId) && inSet(c.blockedId, b.blockedId))),
    },
  },
}));

const { canSeeFollowLists, filterBlocked } = await import('@/lib/social/follow-list-privacy.server');
const siteFollowers = handlersOf(
  (await import('@/lib/profile/api/profile.$id.followers.server')).route,
).GET!;
const siteFollowing = handlersOf(
  (await import('@/lib/profile/api/profile.$id.following.server')).route,
).GET!;
const apiFollowers = handlersOf(
  (await import('@/app/routes/api/v1/users/$handle/followers')).Route,
).GET!;
const apiFollowing = handlersOf(
  (await import('@/app/routes/api/v1/users/$handle/following')).Route,
).GET!;

const follow = (a: string, b: string) => db.edges.push({ followerId: a, followingId: b });

beforeEach(() => {
  db.viewer = null;
  db.visibility.clear();
  db.edges = [];
  db.admins.clear();
  db.blocks = [];
});

describe('canSeeFollowLists', () => {
  it('everyone: anyone, signed out too; no profile row is the same', async () => {
    expect(await canSeeFollowLists(null, 'owner-id')).toBe(true);
    db.visibility.set('owner-id', 'everyone');
    expect(await canSeeFollowLists('v', 'owner-id')).toBe(true);
  });

  it('mutuals: needs the follow in both directions', async () => {
    db.visibility.set('owner-id', 'mutuals');
    expect(await canSeeFollowLists('v', 'owner-id')).toBe(false);
    follow('v', 'owner-id'); // a one-way follower
    expect(await canSeeFollowLists('v', 'owner-id')).toBe(false);
    follow('owner-id', 'v'); // followed back
    expect(await canSeeFollowLists('v', 'owner-id')).toBe(true);
  });

  it('mutuals: someone the owner follows who does not follow back is out', async () => {
    db.visibility.set('owner-id', 'mutuals');
    follow('owner-id', 'v');
    expect(await canSeeFollowLists('v', 'owner-id')).toBe(false);
  });

  it('mutuals and me: signed out is refused', async () => {
    db.visibility.set('owner-id', 'mutuals');
    expect(await canSeeFollowLists(null, 'owner-id')).toBe(false);
    db.visibility.set('owner-id', 'me');
    expect(await canSeeFollowLists(null, 'owner-id')).toBe(false);
  });

  it('me: only the owner and admins', async () => {
    db.visibility.set('owner-id', 'me');
    follow('v', 'owner-id');
    follow('owner-id', 'v');
    expect(await canSeeFollowLists('v', 'owner-id')).toBe(false);
    expect(await canSeeFollowLists('owner-id', 'owner-id')).toBe(true);
    db.admins.add('v');
    expect(await canSeeFollowLists('v', 'owner-id')).toBe(true);
  });

  it('the owner sees their own lists whatever the setting', async () => {
    db.visibility.set('owner-id', 'me');
    expect(await canSeeFollowLists('owner-id', 'owner-id')).toBe(true);
  });

  it('an unrecognised stored value fails closed', async () => {
    db.visibility.set('owner-id', 'friends');
    expect(await canSeeFollowLists('v', 'owner-id')).toBe(false);
  });
});

describe('filterBlocked', () => {
  it('drops accounts blocked in either direction, keeps order, and is a no-op signed out', async () => {
    db.blocks = [
      { blockerId: 'v', blockedId: 'b' },
      { blockerId: 'c', blockedId: 'v' },
      { blockerId: 'x', blockedId: 'y' },
    ];
    expect(await filterBlocked('v', ['a', 'b', 'c', 'd'])).toEqual(['a', 'd']);
    expect(await filterBlocked(null, ['a', 'b'])).toEqual(['a', 'b']);
    expect(await filterBlocked('v', [])).toEqual([]);
  });
});

type Json = { users?: { id: string }[]; data?: { id: string }[]; error?: unknown; code?: string };
const call = async (h: (a: { request: Request; params: Record<string, string> }) => Promise<Response>, id: string) => {
  const res = await h({ request: new Request('http://t/x?limit=20', { headers: db.viewer ? { cookie: 'better-auth.session_token=t' } : {} }), params: { id, handle: id } });
  return { status: res.status, body: (await res.json()) as Json };
};

const endpoints = [
  { name: 'site followers', run: () => call(siteFollowers, 'owner'), rows: (b: Json) => b.users!, seed: (v: string) => follow(v, 'owner-id') },
  { name: 'site following', run: () => call(siteFollowing, 'owner'), rows: (b: Json) => b.users!, seed: (v: string) => follow('owner-id', v) },
  { name: 'developer API followers', run: () => call(apiFollowers, 'owner'), rows: (b: Json) => b.data!, seed: (v: string) => follow(v, 'owner-id') },
  { name: 'developer API following', run: () => call(apiFollowing, 'owner'), rows: (b: Json) => b.data!, seed: (v: string) => follow('owner-id', v) },
];

describe.each(endpoints)('$name', ({ run, rows, seed }) => {
  it('answers 403 when the owner keeps it to themselves, and lists nothing', async () => {
    db.visibility.set('owner-id', 'me');
    seed('alex');
    db.viewer = 'v';
    const { status, body } = await run();
    expect(status).toBe(403);
    expect(JSON.stringify(body)).not.toContain('alex');
    const code = (body.error as { code?: string } | string | undefined) ?? undefined;
    expect(body.code ?? (typeof code === 'object' ? code.code : undefined)).toMatch(/^(LIST_PRIVATE|list_private)$/);
  });

  it('mutuals: refuses a one-way follower, serves a mutual', async () => {
    db.visibility.set('owner-id', 'mutuals');
    seed('alex');
    db.viewer = 'v';
    follow('v', 'owner-id');
    expect((await run()).status).toBe(403);
    follow('owner-id', 'v');
    const ok = await run();
    expect(ok.status).toBe(200);
    expect(rows(ok.body).some((u) => u.id === 'alex')).toBe(true);
  });

  it('refuses a signed-out viewer when the lists are not public', async () => {
    db.visibility.set('owner-id', 'mutuals');
    seed('alex');
    expect((await run()).status).toBe(403);
  });

  it('serves everyone by default, and an admin whatever the setting', async () => {
    seed('alex');
    expect((await run()).status).toBe(200);
    db.visibility.set('owner-id', 'me');
    db.viewer = 'mod';
    db.admins.add('mod');
    expect((await run()).status).toBe(200);
  });

  it('omits accounts blocked in either direction', async () => {
    seed('alex');
    seed('blocked-by-me');
    seed('blocked-me');
    db.viewer = 'v';
    db.blocks = [
      { blockerId: 'v', blockedId: 'blocked-by-me' },
      { blockerId: 'blocked-me', blockedId: 'v' },
    ];
    const ids = rows((await run()).body).map((u) => u.id);
    expect(ids).toEqual(['alex']);
  });
});

const root = join(__dirname, '../../..');
const src = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('every path that reveals who follows whom is gated', () => {
  it('the registered paths all exist and call the one function', () => {
    for (const rel of FOLLOW_LIST_READ_PATHS) {
      expect(existsSync(join(root, rel)), rel).toBe(true);
    }
    for (const rel of FOLLOW_LIST_READ_PATHS.filter((p) => !p.includes('explore'))) {
      const text = src(rel);
      const gated = text.includes('canSeeFollowLists');
      expect(gated, `${rel} must call canSeeFollowLists`).toBe(true);
      expect(text.includes('filterBlocked'), `${rel} must call filterBlocked`).toBe(true);
    }
  });

  it('no other file lists another member from a follow edge', () => {
    // Own-data readers: the viewer's or key owner's own lists, their own follow manager, their own digest.
    const OWN = new Set([
      'app/routes/api/v1/me/following.ts',
      'app/routes/api/v1/me/followers.ts',
      'lib/developer/recipes.server.ts',
      'lib/bulk/bulk.server.ts',
      'lib/games/activity.server.ts',
      'lib/social/audience.server.ts',
      'lib/social/follow-manager.server.ts',
      'lib/tags.server.ts',
      // Read the VIEWER's own edges (their following ids, back-edges to them, or a per-id "do I follow these" probe),
      // or the owner's own followers for their own notification; none reveals another member's list.
      'lib/circle.server.ts',
      'lib/social/follow-graph.server.ts',
      'lib/moderation/api/moderation.block.server.ts',
      'lib/game/leaderboard-scope.server.ts',
      'lib/account/api/account.export.server.ts',
      'lib/digest/assemble.server.ts',
      'lib/presence.server.ts',
      'lib/messages/api/messages.sidebar.server.ts',
      'lib/feed/mention-search.server.ts',
      'lib/feed/page-reconcile.server.ts',
      'lib/gifting/birthday.server.ts',
      'lib/playtime/playtime.server.ts',
      'lib/games/meta.server.ts',
      'features/slice-it/api/slice-it.leaderboard.server.ts',
      'server/socket-server/handlers/group-call.ts',
      'server/socket-server/handlers/party.ts',
    ]);
    const known = new Set<string>([...FOLLOW_LIST_READ_PATHS, ...OWN]);
    const files = execSync(
      `grep -rlE "(follower|following): \\{ select|FROM follow|JOIN follow|\\.follow\\.findMany|(prisma|tx)\\.follow$" app lib features server --include=*.ts --include=*.tsx`,
      { cwd: root, encoding: 'utf8' },
    )
      .split('\n')
      .filter((f) => f && !/__tests__|\.test\./.test(f));
    const unknown = files.filter((f) => !known.has(f));
    expect(unknown, 'a new reader of follow edges must be added to FOLLOW_LIST_READ_PATHS (gated) or the own-data list').toEqual([]);
  });

  it('the Steam-style profile shows friends only to a viewer who may see the list', () => {
    const text = src('lib/games/profile.server.ts');
    expect(text).toMatch(/profile\.canSeeFollowLists\s*\?\s*prisma\.follow\.findMany/);
    expect(text).toContain('filterBlocked');
  });
});

describe('"Followed by" suggestion lines', () => {
  const text = src('lib/explore.server.ts');
  const schema = src('prisma/schema/profile.prisma');

  it('only name members whose following list the viewer could browse', () => {
    expect(text).toContain(`COALESCE(p."followListVisibility", 'everyone') = 'everyone'`);
    expect(text).toContain(`p."followListVisibility" = 'mutuals'`);
    expect(text).toContain(
      `EXISTS (SELECT 1 FROM follow back WHERE back."followerId" = u.id AND back."followingId" = \${viewerId})`,
    );
    // `me` (and any unknown value) matches neither branch, so the member is neither named nor counted.
    expect(text).not.toMatch(/followListVisibility" = 'me'/);
  });

  it('use the real table and column names', () => {
    expect(text).toContain('LEFT JOIN user_profile p ON p."userId" = u.id');
    expect(schema).toMatch(/model UserProfile \{[\s\S]*?followListVisibility\s+String\s+@default\("everyone"\) @db\.VarChar\(10\)[\s\S]*?@@map\("user_profile"\)/);
    expect(src('prisma/schema/social.prisma')).toMatch(/model Follow \{[\s\S]*?@@map\("follow"\)/);
  });
});

/**
 * The profile preview (sprint 10 08), end to end over the REAL readers (`getProfile`, the profile posts reader,
 * `getPublicShelves`, the audience helpers) and a small in-memory Prisma that evaluates the `where` shapes those readers
 * send. Nothing touches a database. The fake records every write call: a preview must make none.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const OWNER = 'owner1';
const BLOCKER = 'blocker1';
const FRIEND = 'friend1';

/** A row or a `where` clause, read loosely: the fake only needs the fields the readers send. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  session: null as string | null,
  online: [] as string[],
  db: {} as Record<string, Row[]>,
  writes: [] as string[],
  profileCalls: [] as Array<{ id: string; viewer: string | null }>,
}));

/* ── a tiny `where` evaluator: only the operators the readers send ───────────────────────────────────────────────── */
const OPS = ['in', 'notIn', 'not', 'lt', 'gt', 'gte', 'lte', 'isNot', 'some', 'none', 'equals'];
const isPlain = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

function matchValue(raw: unknown, condition: unknown): boolean {
  const value = raw as Row;
  const cond = condition as Row | Date | null;
  if (cond === null) return raw === null || raw === undefined;
  if (cond instanceof Date) return raw instanceof Date && raw.getTime() === cond.getTime();
  if (!isPlain(cond)) return raw === cond;
  const keys = Object.keys(cond);
  if (keys.some((k) => OPS.includes(k))) {
    return keys.every((k) => {
      const c = cond[k];
      switch (k) {
        case 'in':
          return c.includes(raw);
        case 'notIn':
          return !c.includes(raw);
        case 'not':
          return c === null ? raw !== null && raw !== undefined : raw !== c;
        case 'equals':
          return raw === c;
        case 'lt':
          return (raw as number) < c;
        case 'lte':
          return (raw as number) <= c;
        case 'gt':
          return (raw as number) > c;
        case 'gte':
          return (raw as number) >= c;
        case 'isNot':
          return raw == null ? true : !matches(value, c);
        case 'some':
          return ((raw ?? []) as Row[]).some((r) => matches(r, c));
        case 'none':
          return !((raw ?? []) as Row[]).some((r) => matches(r, c));
        default:
          return true;
      }
    });
  }
  return raw == null ? false : matches(value, cond);
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    if (key === 'AND') return (Array.isArray(cond) ? cond : [cond]).every((w: Row) => matches(row, w));
    if (key === 'NOT') return !matches(row, cond);
    return matchValue(row[key], cond);
  });
}

const WRITE_METHODS = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
];

vi.mock('@/lib/prisma.server', () => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => {
          if (WRITE_METHODS.includes(method)) {
            return async () => {
              h.writes.push(`${name}.${method}`);
              return {};
            };
          }
          const rows = () => h.db[name] ?? [];
          if (method === 'findMany')
            return async (args: Row = {}) => {
              let out = rows().filter((r) => matches(r, args.where));
              if (args.orderBy && !Array.isArray(args.orderBy) && args.orderBy.createdAt === 'desc') {
                out = [...out].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
              }
              return args.take ? out.slice(0, args.take) : out;
            };
          if (method === 'findFirst' || method === 'findUnique')
            return async (args: Row = {}) => {
              const where = { ...args.where };
              for (const [k, v] of Object.entries(where)) {
                // Compound unique keys (`followerId_followingId`) flatten to their fields.
                if (k.includes('_') && isPlain(v)) {
                  delete where[k];
                  Object.assign(where, v);
                }
              }
              const row = rows().find((r) => matches(r, where)) ?? null;
              if (!row || !args.select?.followers) return row;
              // The profile select asks for the viewer's own follow edge to this member.
              const viewer = args.select.followers.where.followerId;
              return {
                ...row,
                followers: (h.db.follow ?? []).filter((f) => f.followingId === row.id && f.followerId === viewer),
              };
            };
          if (method === 'count') return async (args: Row = {}) => rows().filter((r) => matches(r, args.where)).length;
          if (method === 'groupBy') return async () => [];
          if (method === 'aggregate') return async () => ({ _sum: { amount: 0 } });
          return async () => null;
        },
      },
    );
  return {
    prisma: new Proxy(
      {
        $executeRaw: async () => {
          h.writes.push('$executeRaw');
          return 0;
        },
        $executeRawUnsafe: async () => {
          h.writes.push('$executeRawUnsafe');
          return 0;
        },
        $transaction: async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : undefined),
      } as Record<string, unknown>,
      { get: (t, k: string) => (k in t ? t[k] : model(k)) },
    ),
  };
});

vi.mock('@/lib/cached.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cached.server')>()),
  cached: async (_k: string, _ttl: number, loader: () => unknown) => loader(),
  cachedMiss: async (_k: string, loader: () => unknown) => loader(),
  invalidateCached: async () => undefined,
}));
vi.mock('@/lib/redis.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redis.server')>()),
  hashTagged: (a: string, b: string) => `${a}:${b}`,
}));
vi.mock('@/lib/hot-counters.server', () => ({ filterOnlineUsers: async () => h.online }));
vi.mock('@/lib/presence.server', () => ({ getActivity: async () => null }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => (h.session ? { user: { id: h.session }, session: {} } : null) } },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));

import { previewProfile } from '@/lib/profile/preview.server';
import { PREVIEW_STRANGER_ID } from '@/lib/profile/preview';
import * as profileServer from '@/lib/profile.server';
import { route as previewRoute } from '@/lib/profile/api/profile.preview.server';

/* ── fixtures ────────────────────────────────────────────────────────────────────────────────────────────────────── */
const person = (id: string, name: string, hides = false): Row => ({
  id,
  name,
  image: null,
  username: id,
  handle: id,
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: { displayName: null, customImage: null, hideCountsOnMine: hides },
  inventory: [],
  followers: [],
  creatorMemberships: [],
  closeFriendsOwned: [],
});

const ownerRow = (profile: Row = {}): Row => ({
  ...person(OWNER, 'Owner Person'),
  handleChangedAt: null,
  createdAt: new Date('2024-01-01'),
  lastSeenAt: new Date(),
  birthday: null,
  profile: {
    displayName: null,
    customImage: null,
    bio: 'my bio',
    followListVisibility: 'everyone',
    presenceVisibility: 'mutuals',
    presenceDetail: true,
    showLikes: false,
    guestbookMode: 'off',
    hideCountsOnMine: false,
    ...profile,
  },
  followerCount: 3,
  followingCount: 2,
  postCount: 5,
  profileLayout: null,
  profilePlus: null,
});

let seq = 0;
const post = (over: Row = {}): Row => {
  seq += 1;
  const author: Row = over.user ?? person(OWNER, 'Owner Person');
  return {
    id: `p${seq}`,
    userId: author.id,
    content: `post text ${seq}`,
    gifUrl: null,
    createdAt: new Date(Date.UTC(2025, 0, seq)),
    updatedAt: new Date(0),
    editedAt: null,
    audience: 'PUBLIC',
    deletedAt: null,
    deletedByAdmin: false,
    expiresAt: null,
    pinnedAt: null,
    unlockPrice: null,
    communityId: null,
    community: null,
    isSensitive: false,
    contentWarning: null,
    likeCount: 11,
    commentCount: 12,
    repostCount: 13,
    viewCount: 14,
    imageUrls: [],
    imageAlts: [],
    pinnedCommentId: null,
    user: author,
    likes: [],
    reposts: [],
    unlocks: [],
    poll: null,
    original: null,
    ...over,
  };
};

function seed(over: { owner?: Row; posts?: Row[]; reposts?: Row[]; blocks?: Row[]; follows?: Row[] } = {}) {
  const posts = over.posts ?? [];
  h.db = {
    user: [over.owner ?? ownerRow(), person(BLOCKER, 'Blocking Person'), person(FRIEND, 'Friendly Person')],
    userProfile: [{ userId: OWNER, ...(over.owner?.profile ?? ownerRow().profile) }],
    rMHark: posts,
    rMHarkRepost: over.reposts ?? [],
    userBlock: over.blocks ?? [],
    follow: over.follows ?? [],
    userInventory: [],
    creatorMembership: [],
    closeFriend: [],
    readingPrefs: [],
  };
}

const repostOf = (rmhark: Row): Row => ({
  id: `rp${rmhark.id}`,
  userId: OWNER,
  createdAt: new Date(Date.UTC(2025, 5, 1)),
  user: person(OWNER, 'Owner Person'),
  rmhark,
});

const AUDIENCES = ['signed-out', 'stranger'] as const;

beforeEach(() => {
  h.writes = [];
  h.online = [];
  h.session = null;
  h.profileCalls = [];
  seq = 0;
  seed();
});

describe('the audiences', () => {
  it('signed out is no viewer and the stranger is the reserved id, and neither is the owner', async () => {
    const spy = vi.spyOn(profileServer, 'getProfile');
    await previewProfile(OWNER, 'signed-out');
    await previewProfile(OWNER, 'stranger');
    expect(spy.mock.calls.map((c) => c[1].id)).toEqual([null, PREVIEW_STRANGER_ID]);
    expect(spy.mock.calls.every((c) => c[1].isAdmin === false)).toBe(true);
    expect(h.db.user!.some((u) => u.id === PREVIEW_STRANGER_ID || u.handle === PREVIEW_STRANGER_ID)).toBe(false);
    spy.mockRestore();
  });

  it('a member who does not exist previews as null', async () => {
    h.db.user = [];
    expect(await previewProfile(OWNER, 'stranger')).toBeNull();
  });
});

describe('posts', () => {
  it('shows public posts and leaves out circle, supporter, follower and private posts, whatever the audience', async () => {
    seed({
      posts: [
        post({ id: 'pub', content: 'open to all' }),
        post({ id: 'circle', audience: 'CIRCLE', content: 'circle only' }),
        post({ id: 'supp', audience: 'SUPPORTERS', content: 'supporters only' }),
        post({ id: 'fol', audience: 'FOLLOWERS', content: 'followers only' }),
        post({ id: 'priv', audience: 'PRIVATE', content: 'private' }),
      ],
    });
    for (const audience of AUDIENCES) {
      const result = await previewProfile(OWNER, audience);
      expect(result!.posts.map((p) => p.id)).toEqual(['pub']);
      expect(JSON.stringify(result)).not.toMatch(/circle only|supporters only|followers only|private/);
    }
  });

  it('hides the counts when the owner hides them, and shows them otherwise', async () => {
    seed({
      owner: ownerRow({ hideCountsOnMine: true }),
      posts: [post({ id: 'a', user: person(OWNER, 'Owner Person', true) })],
    });
    for (const audience of AUDIENCES) {
      const [row] = (await previewProfile(OWNER, audience))!.posts;
      expect(row).toMatchObject({ kind: 'post', counts: { likes: null, replies: null, reposts: null, views: null } });
    }
    seed({ posts: [post({ id: 'a' })] });
    const [open] = (await previewProfile(OWNER, 'stranger'))!.posts;
    expect(open).toMatchObject({ counts: { likes: 11, replies: 12, reposts: 13, views: 14 } });
  });

  it('a content warning covers the text', async () => {
    seed({ posts: [post({ id: 'cw', isSensitive: true, contentWarning: 'spoilers', content: 'the butler did it' })] });
    const result = await previewProfile(OWNER, 'signed-out');
    expect(result!.posts[0]).toMatchObject({ text: null, contentWarning: 'spoilers', counts: null });
    expect(JSON.stringify(result)).not.toContain('the butler did it');
  });
});

describe('what the owner could not open', () => {
  const blocked = [{ blockerId: BLOCKER, blockedId: OWNER }];

  it('a repost of a post by a member who blocked the owner is "a post you can\'t see", in both audiences', async () => {
    const theirs = post({ id: 'theirs', user: person(BLOCKER, 'Blocking Person'), content: 'secret words' });
    seed({ posts: [theirs], reposts: [repostOf(theirs)], blocks: blocked });
    for (const audience of AUDIENCES) {
      const result = await previewProfile(OWNER, audience);
      expect(result!.posts).toEqual([{ kind: 'hidden', id: 'repost:rptheirs' }]);
      const text = JSON.stringify(result);
      expect(text).not.toContain('secret words');
      expect(text).not.toContain('Blocking Person');
    }
  });

  it('a repost of a post by someone the owner can open is shown with its author', async () => {
    const theirs = post({ id: 'theirs', user: person(FRIEND, 'Friendly Person'), content: 'hello there' });
    seed({ posts: [theirs], reposts: [repostOf(theirs)] });
    const result = await previewProfile(OWNER, 'stranger');
    expect(result!.posts[0]).toMatchObject({
      kind: 'post',
      repost: true,
      author: 'Friendly Person',
      text: 'hello there',
    });
  });

  it('a muted author is covered too (the owner never sees their posts)', async () => {
    const theirs = post({ id: 'theirs', user: person(FRIEND, 'Friendly Person'), content: 'muted words' });
    seed({ posts: [theirs], reposts: [repostOf(theirs)] });
    h.db.userMute = [{ muterId: OWNER, mutedId: FRIEND }];
    const result = await previewProfile(OWNER, 'signed-out');
    expect(result!.posts).toEqual([{ kind: 'hidden', id: 'repost:rptheirs' }]);
  });

  it("a quote card of a post by a member who blocked the owner is hidden, and the owner's own text stays", async () => {
    const theirs = {
      ...post({ id: 'quoted', user: person(BLOCKER, 'Blocking Person'), content: 'quoted secret' }),
      community: null,
    };
    const mine = post({ id: 'mine', content: 'my reply', original: theirs });
    seed({ posts: [mine, theirs], blocks: blocked });
    for (const audience of AUDIENCES) {
      const [row] = (await previewProfile(OWNER, audience))!.posts;
      expect(row).toMatchObject({ kind: 'post', text: 'my reply', quote: { state: 'hidden' } });
      expect(JSON.stringify(row)).not.toMatch(/quoted secret|Blocking Person/);
    }
  });

  it('a quote card of a post the owner can open is shown', async () => {
    const theirs = post({ id: 'quoted', user: person(FRIEND, 'Friendly Person'), content: 'quoted fine' });
    seed({ posts: [post({ id: 'mine', original: theirs }), theirs] });
    const [row] = (await previewProfile(OWNER, 'signed-out'))!.posts;
    expect(row).toMatchObject({ quote: { state: 'visible', author: 'Friendly Person', text: 'quoted fine' } });
  });
});

describe('the header and the sections', () => {
  it('follow lists are visible or hidden, never names, and the header carries the counts', async () => {
    seed({
      owner: ownerRow({ followListVisibility: 'mutuals' }),
      follows: [
        { followerId: FRIEND, followingId: OWNER },
        { followerId: OWNER, followingId: FRIEND },
      ],
    });
    for (const audience of AUDIENCES) {
      const result = await previewProfile(OWNER, audience);
      expect(result!.header).toMatchObject({ followLists: 'hidden', followerCount: 3, followingCount: 2 });
      expect(result!.sections.find((r) => r.id === 'follow-lists')).toMatchObject({ visible: false });
      expect(JSON.stringify(result)).not.toContain('Friendly Person');
      expect(result!.header).not.toHaveProperty('followers');
      expect(result!.header).not.toHaveProperty('following');
    }
    seed({ owner: ownerRow({ followListVisibility: 'everyone' }) });
    expect((await previewProfile(OWNER, 'signed-out'))!.header.followLists).toBe('visible');
    seed({ owner: ownerRow({ followListVisibility: 'me' }) });
    expect((await previewProfile(OWNER, 'stranger'))!.header.followLists).toBe('hidden');
  });

  it('presence "mutuals" reads offline in both previews, even for a member who is online right now', async () => {
    h.online = [OWNER];
    seed({ owner: ownerRow({ presenceVisibility: 'mutuals' }) });
    for (const audience of AUDIENCES) {
      expect((await previewProfile(OWNER, audience))!.header.presence).toEqual({ state: 'offline' });
    }
  });

  it('lists each tab with its visibility, from the same decisions the tab bar uses', async () => {
    seed({ owner: ownerRow({ showLikes: true, guestbookMode: 'everyone' }) });
    const rows = (await previewProfile(OWNER, 'signed-out'))!.sections;
    const vis = Object.fromEntries(rows.map((r) => [r.id, r.visible]));
    expect(vis).toMatchObject({ posts: true, likes: true, guestbook: true, shelves: false, 'follow-lists': true });
  });

  it('describes followers and mutuals from the settings', async () => {
    seed({ owner: ownerRow({ presenceVisibility: 'mutuals', followListVisibility: 'mutuals' }) });
    const { described } = (await previewProfile(OWNER, 'stranger'))!;
    const at = (rows: typeof described.follower, id: string) => rows.find((r) => r.id === id)?.visible;
    expect(at(described.follower, 'presence')).toBe(false);
    expect(at(described.mutual, 'presence')).toBe(true);
    expect(at(described.follower, 'follow-lists')).toBe(false);
    expect(at(described.mutual, 'follow-lists')).toBe(true);
  });
});

describe('no write', () => {
  it('a full preview in each audience makes no write call', async () => {
    const theirs = post({ id: 'theirs', user: person(FRIEND, 'Friendly Person') });
    seed({
      posts: [post({ id: 'a', pinnedAt: new Date(1) }), post({ id: 'b', original: theirs }), theirs],
      reposts: [repostOf(theirs)],
    });
    for (const audience of AUDIENCES) await previewProfile(OWNER, audience);
    expect(h.writes).toEqual([]);
  });

  it('the fake would record a write (the assertion above can fail)', async () => {
    const { prisma } = await import('@/lib/prisma.server');
    await prisma.rMHark.update({ where: { id: 'x' }, data: {} });
    expect(h.writes).toEqual(['rMHark.update']);
  });
});

describe('the endpoint', () => {
  const get = async (query: string) => {
    const handler = handlersOf(previewRoute).GET!;
    return handler({
      request: new Request(`http://localhost/api/profile/preview${query}`, {
        headers: { 'cf-connecting-ip': String(Math.random()), cookie: 'better-auth.session_token=t' },
      }),
      params: {},
    });
  };

  it('refuses a signed-out caller', async () => {
    h.session = null;
    expect((await get('?audience=stranger')).status).toBe(401);
  });

  it('previews only the caller: a profile id in the request is ignored', async () => {
    h.session = OWNER;
    const spy = vi.spyOn(profileServer, 'getProfile');
    const res = await get(`?audience=stranger&id=${FRIEND}&userId=${FRIEND}`);
    expect(res.status).toBe(200);
    expect((await res.json()).header.id).toBe(OWNER);
    expect(spy.mock.calls.every((c) => c[0] === OWNER)).toBe(true);
    expect(res.headers.get('cache-control')).toContain('no-store');
    spy.mockRestore();
  });

  it('rejects an audience it does not compute', async () => {
    h.session = OWNER;
    expect((await get('?audience=follower')).status).toBe(400);
    expect((await get('')).status).toBe(400);
  });

  it('the stranger id matches no member the way a view-as lookup would', async () => {
    const { findMemberForViewAs } = await import('@/lib/safety/view-as.server');
    expect(await findMemberForViewAs(PREVIEW_STRANGER_ID)).toBeNull();
  });
});

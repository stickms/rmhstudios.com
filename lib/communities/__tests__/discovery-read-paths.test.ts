/**
 * Out of discovery (sprint 10 17).
 *
 * `DISCOVERY_READ_PATHS` lists every server file that offers communities, or posts by their community, to people who
 * are not in it. A source scan holds the list in both directions: every listed file applies the discovery rule, and a
 * file that lists communities without being named (here or in the exempt list, with a reason) fails. Behaviour is
 * then checked against an in-memory store: a delisted community is absent from the directory, Explore, the related
 * rail, a game's communities, the sitemap, and present on its own page and to its moderators.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISCOVERABLE_POST_SQL,
  DISCOVERY_EXEMPT_PATHS,
  DISCOVERY_READ_PATHS,
  discoverableCommunityWhere,
  discoverablePostWhere,
  isDelisted,
} from '@/lib/communities/discovery';

const root = process.cwd();
const src = (rel: string) => readFileSync(join(root, rel), 'utf8');
/** Drops block and line comments (a `//` inside a string such as a URL is kept by requiring whitespace or line start). */
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

type Row = Record<string, unknown>;

/** The subset of Prisma's `where` the readers use, evaluated against plain rows. */
function matches(row: Row | null | undefined, where: Record<string, unknown> | undefined): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (key === 'OR') {
      if (!(cond as Record<string, unknown>[]).some((w) => matches(row, w))) return false;
      continue;
    }
    if (key === 'AND') {
      if (!(cond as Record<string, unknown>[]).every((w) => matches(row, w))) return false;
      continue;
    }
    const value = row ? row[key] : undefined;
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ('isNot' in c) {
        if (value && matches(value as Row, c.isNot as Record<string, unknown>)) return false;
      } else if ('in' in c) {
        if (!(c.in as unknown[]).includes(value)) return false;
      } else if ('notIn' in c) {
        if ((c.notIn as unknown[]).includes(value)) return false;
      } else if ('gt' in c) {
        if (!(Number(value) > Number(c.gt))) return false;
      } else if ('gte' in c) {
        if (!(new Date(value as Date).getTime() >= new Date(c.gte as Date).getTime())) return false;
      } else if ('contains' in c) {
        if (!String(value).toLowerCase().includes(String(c.contains).toLowerCase())) return false;
      } else if (!value || !matches(value as Row, c)) return false;
    } else if ((value ?? null) !== cond) return false;
  }
  return true;
}

const db = vi.hoisted(() => ({
  communities: [] as Row[],
  posts: [] as Row[],
  pages: [] as Row[],
  sisters: [] as Row[],
  role: 'MOD' as string,
}));

const find =
  (rows: Row[]) =>
  async (args: { where?: Record<string, unknown> } = {}) =>
    rows.filter((r) => matches(r, args.where));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    community: {
      findMany: async (args: { where?: Record<string, unknown> }) => find(db.communities)(args),
      count: async (args: { where?: Record<string, unknown> }) => (await find(db.communities)(args)).length,
      findUnique: async ({ where }: { where: { slug?: string } }) =>
        db.communities.find((c) => c.slug === where.slug) ?? null,
    },
    communityMember: {
      findMany: async () => [],
      findUnique: async () => ({ role: db.role, joinedAt: new Date(0), followedFlairIds: [], roleTags: [] }),
    },
    communityJoinRequest: { findMany: async () => [] },
    communitySister: {
      findMany: async (args: { where?: Record<string, unknown> }) => find(db.sisters)(args),
    },
    communityPage: {
      findMany: async (args: { where?: Record<string, unknown> }) => find(db.pages)(args),
      count: async (args: { where?: Record<string, unknown> }) => (await find(db.pages)(args)).length,
    },
    aiPersona: { count: async () => 0, findMany: async () => [] },
    flashcardDeck: { count: async () => 0, findMany: async () => [] },
    tournament: { count: async () => 0, findMany: async () => [] },
    hashtag: { findMany: async () => [] },
    libraryDocument: { findMany: async () => [], count: async () => 0 },
    user: {
      findMany: async () => [],
      findUnique: async () => ({ emailVerified: true, createdAt: new Date(0) }),
    },
    blogPost: { count: async () => 0, findMany: async () => [] },
    newsArticle: { count: async () => 0, findMany: async () => [] },
    album: { count: async () => 0, findMany: async () => [] },
    gameGuide: { count: async () => 0, findMany: async () => [] },
    follow: { findMany: async () => [] },
    rMHark: {
      findMany: async (args: { where?: Record<string, unknown> }) => find(db.posts)(args),
    },
    $queryRaw: async () => [],
  },
}));
vi.mock('@/lib/cached.server', () => ({
  cached: async (_k: string, _t: number, fn: () => unknown) => fn(),
  invalidateCached: async () => undefined,
}));
vi.mock('@/lib/redis.server', () => ({ redisEnabled: () => false }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => [] }));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  rmharkIncludeLite: () => ({}),
  mapRmharksWithBoundedReactions: async (rows: { id: string }[]) => rows.map((r) => ({ id: r.id })),
}));
vi.mock('@/lib/feed/timeline', () => ({ getMutedWords: async () => [], applyMutedWords: (i: unknown[]) => i }));
vi.mock('@/lib/achievements.server', () => ({ listAchievements: async () => null }));
vi.mock('@/lib/cards/cards.server', () => ({ getTitleCards: async () => null }));
vi.mock('@/lib/playtime/playtime.server', () => ({
  getActivity: async () => null,
  listFriendsWhoPlay: async () => [],
  listTopPlayers: async () => [],
}));
vi.mock('@/lib/communities/flairs.server', () => ({ listFlairs: async () => [] }));
vi.mock('@/lib/communities/onboarding.server', () => ({ getUnansweredQuestions: async () => [] }));
vi.mock('@/lib/communities/rules.server', () => ({ listRules: async () => [] }));
vi.mock('@/lib/communities/settings.server', () => ({
  getCommunitySettings: async () => ({
    flairRequired: false,
    starThreshold: 5,
    verification: { level: 'none', value: 0 },
    requireImageAlt: false,
  }),
}));
vi.mock('@/lib/communities/modlog.server', () => ({ logModAction: async () => undefined }));

const community = (over: Row = {}): Row => ({
  id: 'c1',
  slug: 'open',
  name: 'Open',
  description: null,
  icon: null,
  color: null,
  isPrivate: false,
  memberCount: 10,
  postCount: 1,
  gameId: null,
  createdAt: new Date(0),
  delistedAt: null,
  delistedReason: null,
  ...over,
});
const OUT = { delistedAt: new Date('2026-11-01T00:00:00Z'), delistedReason: 'Spam raids from this community' };

beforeEach(() => {
  db.role = 'MOD';
  db.communities = [
    community(),
    community({ id: 'c2', slug: 'out', name: 'Out', gameId: 'g1', memberCount: 99, ...OUT }),
    community({ id: 'c3', slug: 'game', name: 'Game', gameId: 'g1', memberCount: 5 }),
  ];
  const post = (id: string, communityId: string | null, delisted = false): Row => ({
    id,
    deletedAt: null,
    audience: 'PUBLIC',
    likeCount: 3,
    createdAt: new Date(),
    userId: 'u',
    communityId,
    community: communityId ? { isPrivate: false, delistedAt: delisted ? OUT.delistedAt : null } : null,
  });
  db.posts = [post('p-none', null), post('p-open', 'c1'), post('p-out', 'c2', true)];
  db.pages = [
    { slug: 'a', updatedAt: new Date(0), community: community() },
    { slug: 'b', updatedAt: new Date(0), community: community({ id: 'c2', slug: 'out', ...OUT }) },
  ];
  db.sisters = [
    { communityId: 'c1', position: 0, related: community({ id: 'c3', slug: 'game' }) },
    { communityId: 'c1', position: 1, related: community({ id: 'c2', slug: 'out', ...OUT }) },
  ];
});

describe('the discovery rule', () => {
  it('discoverableCommunityWhere keeps the reader’s conditions and adds not-delisted', () => {
    expect(discoverableCommunityWhere()).toEqual({ delistedAt: null });
    expect(discoverableCommunityWhere({ isPrivate: false, gameId: 'g' })).toEqual({
      isPrivate: false,
      gameId: 'g',
      delistedAt: null,
    });
    expect(discoverablePostWhere()).toEqual({ OR: [{ communityId: null }, { community: { delistedAt: null } }] });
    expect(isDelisted({ delistedAt: new Date() })).toBe(true);
    expect(isDelisted({ delistedAt: null })).toBe(false);
  });

  it('the SQL form names the real table and column, and the schema declares them', () => {
    const schema = src('prisma/schema/communities.prisma');
    expect(schema).toMatch(/@@map\("community"\)/);
    expect(schema).toMatch(/delistedAt\s+DateTime\?/);
    expect(schema).toMatch(/delistedReason\s+String\?\s+@db\.VarChar\(300\)/);
    expect(schema).toMatch(/delistedById\s+String\?/);
    expect(DISCOVERABLE_POST_SQL).toContain('FROM community WHERE "delistedAt" IS NOT NULL');
    expect(DISCOVERABLE_POST_SQL).toContain('"communityId"');
    expect(src('prisma/migrations/20261130060200_s10_admin_communities/migration.sql')).toMatch(
      /ALTER TABLE "community" ADD COLUMN "delistedAt" TIMESTAMP\(3\)/,
    );
  });
});

describe('DISCOVERY_READ_PATHS is held by a source scan', () => {
  it('every listed reader exists and applies the discovery rule', () => {
    for (const rel of DISCOVERY_READ_PATHS) {
      expect(existsSync(join(root, rel)), rel).toBe(true);
      // Comments and strings of prose do not count: only code that really calls or spreads the rule.
      const text = stripComments(src(rel));
      const applies = /discoverableCommunityWhere\(|discoverablePostWhere\(|Prisma\.raw\(DISCOVERABLE_POST_SQL\)/.test(
        text,
      );
      expect(applies, `${rel} must apply the discovery rule`).toBe(true);
    }
  });

  it('every reader of communities is named here or exempted with a reason', () => {
    const LISTS = [
      /\.community\.(findMany|count|groupBy)\(/,
      /\.communityPage\.(findMany|count)\(/,
      /\.communitySister\.findMany\(/,
      /community:\s*\{\s*isPrivate:\s*false/,
      /FROM community\b/,
    ];
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(root, dir))) {
        if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
        if (`${dir}/${name}` === 'lib/communities/discovery.ts') continue;
        const rel = `${dir}/${name}`;
        const full = join(root, rel);
        if (statSync(full).isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const text = readFileSync(full, 'utf8');
          if (LISTS.some((re) => re.test(text))) found.push(rel);
        }
      }
    };
    for (const dir of ['lib', 'app', 'features', 'server']) if (existsSync(join(root, dir))) walk(dir);

    const known = new Set<string>([...DISCOVERY_READ_PATHS, ...Object.keys(DISCOVERY_EXEMPT_PATHS)]);
    const unlisted = found.filter((f) => !known.has(f));
    expect(unlisted, `these read communities without being in DISCOVERY_READ_PATHS or DISCOVERY_EXEMPT_PATHS`).toEqual(
      [],
    );
  });

  it('an exemption is a real file with a reason, and no file is in both lists', () => {
    for (const [rel, reason] of Object.entries(DISCOVERY_EXEMPT_PATHS)) {
      expect(existsSync(join(root, rel)), rel).toBe(true);
      expect(reason.length, rel).toBeGreaterThan(10);
      expect((DISCOVERY_READ_PATHS as readonly string[]).includes(rel), rel).toBe(false);
    }
  });

  it('the community page and its members’ reads do not apply it', () => {
    for (const rel of ['lib/communities/detail.server.ts', 'lib/communities/access.server.ts']) {
      expect(src(rel), rel).not.toMatch(/delistedAt|discoverableCommunityWhere/);
    }
  });
});

describe('a delisted community is out of every discovery reader', () => {
  it('the directory and its search', async () => {
    const { listCommunities } = await import('@/lib/communities/directory.server');
    expect((await listCommunities({ userId: null })).map((c) => c.slug)).toEqual(['open', 'game']);
    expect((await listCommunities({ userId: null, q: 'out' })).map((c) => c.slug)).toEqual([]);
  });

  it('Explore: the community rail and the hot posts', async () => {
    const { listExplore } = await import('@/lib/explore.server');
    const r = await listExplore(null);
    expect(r.communities.map((c) => c.slug)).toEqual(['open', 'game']);
    expect(r.hotPosts.map((p) => p.id).sort()).toEqual(['p-none', 'p-open']);
  });

  it('the related rail', async () => {
    const { getSisters } = await import('@/lib/communities/sisters.server');
    expect((await getSisters('c1')).map((s) => s.slug)).toEqual(['game']);
  });

  it('a game’s communities', async () => {
    const { getLibraryExtras } = await import('@/lib/games/detail.server');
    const extras = await getLibraryExtras(null, 'g1');
    expect(extras.communities.map((c) => c.slug)).toEqual(['game']);
  });

  it('the sitemap: community pages and wiki pages', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    expect(await SITEMAP_SECTIONS.community.count()).toBe(2);
    const entries = await SITEMAP_SECTIONS.community.page(0, 10);
    expect(entries.map((e) => e.loc)).not.toContain('/c/out');
    expect(entries.map((e) => e.loc)).toContain('/c/open');
    expect(await SITEMAP_SECTIONS.content.count()).toBe(1);
    const content = await SITEMAP_SECTIONS.content.page(0, 10);
    expect(content.map((e) => e.loc).some((l) => l.includes('/out/'))).toBe(false);
  });

  it('RSS: a delisted community keeps its feed (only discovery changes)', async () => {
    const { communityFeed } = await import('@/lib/feed/rss-community.server');
    expect(await communityFeed('out')).not.toBeNull();
    expect(await communityFeed('open')).not.toBeNull();
  });
});

describe('a delisted community is unchanged for its own page and moderators', () => {
  it('its moderators read why; nobody else does', async () => {
    const { getCommunityExtras } = await import('@/lib/communities/extras.server');
    const mod = await getCommunityExtras('out', 'm1');
    expect(mod?.delistedReason).toBe(OUT.delistedReason);
    db.role = 'MEMBER';
    const member = await getCommunityExtras('out', 'm2');
    expect(member).not.toBeNull();
    expect(member?.delistedReason).toBeNull();
    const open = await getCommunityExtras('open', 'm1');
    expect(open?.delistedReason).toBeNull();
  });
});

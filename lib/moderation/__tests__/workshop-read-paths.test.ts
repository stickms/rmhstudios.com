import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';
import {
  WORKSHOP_EXEMPT_PATHS,
  WORKSHOP_READ_PATHS,
  WORKSHOP_UNFILTERED_READS,
  notBannedWhere,
} from '@/lib/moderation/workshop-moderation';

/**
 * s15-04: a HUD, a loadout or a story a moderator removed reaches nobody but its owner. Every server file that reads
 * `tf2Hud`, `tf2Loadout` or `versecraftSeedListing` is in `WORKSHOP_READ_PATHS` (and filters on `moderatedAt`) or in
 * `WORKSHOP_EXEMPT_PATHS` with its reason; a new reader that is in neither fails here instead of leaking. Two halves:
 *
 *  1. a source scan over lib/, app/, server/, features/, components/ and scripts/;
 *  2. the readers run against a fake that filters the way Postgres does, as a stranger, as a blocked member, as a banned
 *     author's reader and as the owner.
 */

const ROOT = path.resolve(__dirname, '../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === '.git') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|d)\.(ts|tsx)$/.test(name) && name !== 'routeTree.gen.ts') {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/** Source without comments (a mention in a comment is not a read, and a comment never satisfies a scan). */
function code(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

// Any client name (`prisma`, `tx`, `db`, …), so a reader cannot dodge the scan by renaming the transaction client.
const READ_CALL =
  /\b[A-Za-z_$][\w$]*\.(?:tf2Hud|tf2Loadout|versecraftSeedListing)\.(?:findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|count|aggregate|groupBy)\(/g;

/**
 * A read that reaches the three tables some other way: through a relation of another model (`User.tf2Huds`,
 * `User.tf2Loadouts`, `User.versecraftSeedListings`, `VersecraftWorld.seedListing`) or by raw SQL on the mapped table.
 */
const INDIRECT_READ =
  /\b(?:tf2Huds|tf2Loadouts|versecraftSeedListings|seedListing)\b|\b(?:tf2_hud|tf2_loadout|versecraft_seed_listing)\b/;

/** The text of each read call's arguments, up to its closing parenthesis. */
function readCalls(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(READ_CALL)) {
    let depth = 1;
    let i = (m.index ?? 0) + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
      i++;
    }
    out.push(text.slice(start, i - 1));
  }
  return out;
}

describe('the read-path registry', () => {
  const sources = ['lib', 'app', 'server', 'features', 'components', 'scripts'].flatMap((dir) =>
    walk(path.join(ROOT, dir)),
  );
  const readers = sources.filter((file) => readCalls(code(file)).length > 0);
  const listed = new Set<string>(WORKSHOP_READ_PATHS);
  const exempt = new Set(Object.keys(WORKSHOP_EXEMPT_PATHS));

  it('finds the readers the registry was written from', () => {
    expect(readers).toContain('lib/tf2-hud/hud.server.ts');
    expect(readers).toContain('lib/tf2-loadout/loadout.server.ts');
    expect(readers).toContain('lib/versecraft/api/versecraft.seeds.server.ts');
  });

  it('every file that reads the three tables is listed or exempt, never both', () => {
    const unclassified = readers.filter((file) => !listed.has(file) && !exempt.has(file));
    expect(unclassified, 'add each to WORKSHOP_READ_PATHS (and filter moderatedAt) or exempt it with a reason').toEqual(
      [],
    );
    for (const file of listed) expect(exempt.has(file), `${file} is listed and exempt`).toBe(false);
  });

  it('no file reads the tables through a relation or raw SQL without being listed or exempt', () => {
    const indirect = sources.filter((file) => INDIRECT_READ.test(code(file)) && !listed.has(file) && !exempt.has(file));
    expect(indirect, 'a relation or raw read of a HUD, loadout or story must filter moderatedAt too').toEqual([]);
  });

  it('lists no file that does not read the tables (a dead entry hides a deleted reader)', () => {
    for (const file of [...listed, ...exempt]) {
      expect(readers, `${file} does not read tf2Hud, tf2Loadout or versecraftSeedListing`).toContain(file);
    }
  });

  it('every listed reader names moderatedAt', () => {
    for (const file of listed) {
      expect(code(file), `${file} never mentions moderatedAt`).toMatch(/moderatedAt/);
    }
  });

  it('every read call in a listed file names moderatedAt (a filter, or a select it then checks), bar the stated ones', () => {
    for (const file of listed) {
      const calls = readCalls(code(file));
      const unfiltered = calls.filter((call) => !call.includes('moderatedAt'));
      const allowed = WORKSHOP_UNFILTERED_READS[file];
      expect(
        unfiltered.length,
        `${file}: ${unfiltered.length} read(s) of a HUD, loadout or story ignore moderatedAt:\n${unfiltered.join('\n---\n')}`,
      ).toBe(allowed?.calls ?? 0);
    }
    for (const [file, { reason }] of Object.entries(WORKSHOP_UNFILTERED_READS)) {
      expect(listed.has(file), `${file} is not a listed reader`).toBe(true);
      expect(reason.length).toBeGreaterThan(40);
    }
  });

  it('every exemption states a real reason', () => {
    for (const [file, reason] of Object.entries(WORKSHOP_EXEMPT_PATHS)) {
      expect(reason.trim().length, file).toBeGreaterThan(40);
    }
  });

  it('the three public lists leave out blocked and banned authors, not only removed items', () => {
    for (const [file, hint] of [
      ['lib/tf2-hud/hud.server.ts', 'getHiddenAuthorIds'],
      ['lib/tf2-loadout/loadout.server.ts', 'getHiddenAuthorIds'],
      ['lib/versecraft/api/versecraft.seeds.server.ts', 'getHiddenAuthorIds'],
    ] as const) {
      const text = code(file);
      expect(text, file).toContain(hint);
      expect(text, file).toContain('notBannedWhere');
    }
  });

  it('the scan catches a reader that forgets the filter', () => {
    const bad = 'const rows = await prisma.tf2Hud.findMany({ where: { visibility: "PUBLIC" } });';
    expect(readCalls(bad)).toHaveLength(1);
    expect(readCalls(bad)[0]).not.toContain('moderatedAt');
    expect(readCalls('await db.tf2Loadout.findFirst({ where: { id } })')).toHaveLength(1);
    expect(INDIRECT_READ.test('prisma.user.findUnique({ where: { id }, include: { tf2Huds: true } })')).toBe(true);
    expect(INDIRECT_READ.test('prisma.$queryRaw`SELECT * FROM "versecraft_seed_listing"`')).toBe(true);
    const good = 'prisma.versecraftSeedListing.findMany({ where: { moderatedAt: null }, take: 40 });';
    expect(readCalls(good)[0]).toContain('moderatedAt');
  });

  it('a banned account is one whose ban has not ended', () => {
    const now = new Date('2027-01-05T00:00:00Z');
    expect(notBannedWhere(now)).toEqual({ OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] });
  });
});

/* ── 2. the readers, against a fake that filters like Postgres ──────────── */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  huds: [] as Record<string, unknown>[],
  loadouts: [] as Record<string, unknown>[],
  seeds: [] as Record<string, unknown>[],
  hidden: [] as string[],
  updated: [] as Record<string, unknown>[],
}));

function ok(row: Row, where: Row | undefined): boolean {
  return Object.entries(where ?? {}).every(([key, want]) => {
    if (key === 'OR') return (want as Row[]).some((w) => ok(row, w));
    if (key === 'AND') return (want as Row[]).every((w) => ok(row, w));
    if (key === 'owner' || key === 'author') return ok(row[key] as Row, want as Row);
    if (want && typeof want === 'object' && !(want instanceof Date)) {
      const op = want as Row;
      if ('notIn' in op) return !(op.notIn as unknown[]).includes(row[key]);
      if ('in' in op) return (op.in as unknown[]).includes(row[key]);
      if ('gt' in op) return (row[key] as number) > (op.gt as number);
      if ('lte' in op) return row[key] !== null && (row[key] as Date) <= (op.lte as Date);
      if ('not' in op) return row[key] !== op.not;
    }
    return row[key] === want;
  });
}

const table = (rows: () => Row[]) => ({
  findMany: async ({ where }: { where?: Row }) => rows().filter((r) => ok(r, where)),
  findFirst: async ({ where }: { where?: Row }) => rows().find((r) => ok(r, where)) ?? null,
  findUnique: async ({ where }: { where: Row }) => rows().find((r) => ok(r, where)) ?? null,
  count: async ({ where }: { where?: Row }) => rows().filter((r) => ok(r, where)).length,
  update: async ({ where, data }: { where: Row; data: Row }) => {
    const row = rows().find((r) => ok(r, where));
    if (!row) throw new Error('no row');
    h.updated.push(data);
    return { ...row, ...data };
  },
});

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      tf2Hud: table(() => h.huds),
      tf2Loadout: table(() => h.loadouts),
      versecraftSeedListing: table(() => h.seeds),
      tf2HudLike: { findMany: async () => [] },
      tf2LoadoutLike: { findMany: async () => [] },
      tf2HudVersion: { findFirst: async () => ({ manifest: [] }) },
      tf2HudShare: {
        findUnique: async ({ where }: { where: Row }) => (where.token === 'tok' ? { hudId: 'removed-hud' } : null),
        findFirst: async () => null,
      },
    }),
  };
});
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => h.hidden,
  getBlockedAuthorIds: async () => h.hidden,
}));
vi.mock('@/lib/storage/s3.server', () => ({ getObject: async () => null, putObject: async () => undefined }));
vi.mock('@/lib/tf2-loadout/catalog.server', () => ({ getCatalogObject: async () => null }));
vi.mock('@/lib/api/handler.server', async (orig) => ({
  ...(await orig<object>()),
  defineHandler: (_o: unknown, fn: unknown) => fn,
}));

const OWNER = 'owner';
const person = (id: string, bannedUntil: Date | null = null) => ({
  id,
  name: `Name ${id}`,
  image: null,
  username: null,
  handle: id,
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: null,
  inventory: [],
  bannedUntil,
});
const stamp = new Date('2027-01-05T00:00:00Z');
const when = new Date('2027-01-01T00:00:00Z');

const hud = (id: string, over: Row = {}) => ({
  id,
  slug: `slug-${id}`,
  ownerId: OWNER,
  owner: person(OWNER),
  title: `HUD ${id}`,
  description: '',
  tags: [] as string[],
  visibility: 'PUBLIC',
  baseCommit: 'abc',
  forkOfId: null,
  forkOf: null,
  latestVersion: 1,
  fileCount: 0,
  totalBytes: 0,
  likeCount: 0,
  forkCount: 0,
  downloadCount: 0,
  moderatedAt: null,
  createdAt: when,
  updatedAt: when,
  ...over,
});
const loadout = (id: string, over: Row = {}) => ({
  id,
  slug: `slug-${id}`,
  ownerId: OWNER,
  owner: person(OWNER),
  title: `Loadout ${id}`,
  description: '',
  tfClass: 'spy',
  slots: {},
  itemIds: [] as number[],
  visibility: 'PUBLIC',
  forkOfId: null,
  forkOf: null,
  likeCount: 0,
  forkCount: 0,
  moderatedAt: null,
  createdAt: when,
  updatedAt: when,
  ...over,
});

beforeEach(() => {
  h.hidden = [];
  h.updated = [];
  h.huds = [
    hud('live-hud'),
    // A takedown makes the HUD private with the stamp, so a removed HUD is both.
    hud('removed-hud', { visibility: 'PRIVATE', moderatedAt: stamp }),
    hud('blocked-hud', { ownerId: 'blocked', owner: person('blocked') }),
    hud('banned-hud', { ownerId: 'banned', owner: person('banned', new Date('2099-01-01T00:00:00Z')) }),
    hud('past-ban-hud', { ownerId: 'past', owner: person('past', new Date('2020-01-01T00:00:00Z')) }),
  ];
  h.loadouts = [
    loadout('live-l'),
    loadout('removed-l', { visibility: 'PRIVATE', moderatedAt: stamp }),
    loadout('blocked-l', { ownerId: 'blocked', owner: person('blocked') }),
    loadout('banned-l', { ownerId: 'banned', owner: person('banned', new Date('2099-01-01T00:00:00Z')) }),
  ];
  h.seeds = [
    {
      id: 's-live',
      seed: 'live',
      title: 'Live',
      authorId: OWNER,
      author: person(OWNER),
      moderatedAt: null,
      ratingSum: 0,
      ratingCount: 0,
      forks: 0,
      createdAt: when,
    },
    {
      id: 's-removed',
      seed: 'removed',
      title: 'Removed',
      authorId: OWNER,
      author: person(OWNER),
      moderatedAt: stamp,
      ratingSum: 0,
      ratingCount: 0,
      forks: 0,
      createdAt: when,
    },
    {
      id: 's-blocked',
      seed: 'blocked',
      title: 'Blocked',
      authorId: 'blocked',
      author: person('blocked'),
      moderatedAt: null,
      ratingSum: 0,
      ratingCount: 0,
      forks: 0,
      createdAt: when,
    },
    {
      id: 's-banned',
      seed: 'banned',
      title: 'Banned',
      authorId: 'banned',
      author: person('banned', new Date('2099-01-01T00:00:00Z')),
      moderatedAt: null,
      ratingSum: 0,
      ratingCount: 0,
      forks: 0,
      createdAt: when,
    },
  ];
});

const ids = (items: { id: string }[]) => items.map((i) => i.id).sort();

describe('HUDs (lib/tf2-hud/hud.server.ts)', () => {
  it('the public list leaves out a removed HUD, a blocked author and a banned one (a lapsed ban is back)', async () => {
    const { listHuds } = await import('@/lib/tf2-hud/hud.server');
    h.hidden = ['blocked'];
    const stranger = await listHuds({ userId: 'reader', sort: 'new', limit: 20 });
    expect(ids(stranger.items)).toEqual(['live-hud', 'past-ban-hud']);
    assertJsonSafe(stranger);
    const signedOut = await listHuds({ userId: null, sort: 'new', limit: 20 });
    expect(ids(signedOut.items)).toContain('live-hud');
    expect(ids(signedOut.items)).not.toContain('removed-hud');
  });

  it('the owner list keeps the removed HUD, marked', async () => {
    const { listHuds } = await import('@/lib/tf2-hud/hud.server');
    const mine = await listHuds({ userId: OWNER, sort: 'new', limit: 20, mine: true });
    expect(mine.items.find((i) => i.id === 'removed-hud')).toMatchObject({ removed: true, visibility: 'PRIVATE' });
    expect(mine.items.find((i) => i.id === 'live-hud')).toMatchObject({ removed: false });
  });

  it('a stranger cannot open a removed HUD by id or slug; its owner can, marked', async () => {
    const { getHud } = await import('@/lib/tf2-hud/hud.server');
    for (const key of ['removed-hud', 'slug-removed-hud']) {
      await expect(getHud(key, 'reader')).rejects.toMatchObject({ status: 404 });
      await expect(getHud(key, null)).rejects.toMatchObject({ status: 404 });
      expect(await getHud(key, OWNER)).toMatchObject({ removed: true, isOwner: true });
    }
    expect(await getHud('live-hud', 'reader')).toMatchObject({ removed: false });
  });

  it('a share link to a removed HUD stops working for everyone but its owner, files included', async () => {
    const { getHudByShare, readSharedFile } = await import('@/lib/tf2-hud/hud.server');
    await expect(getHudByShare('tok', 'reader')).rejects.toMatchObject({ status: 404 });
    await expect(getHudByShare('tok', null)).rejects.toMatchObject({ status: 404 });
    expect(await getHudByShare('tok', OWNER)).toMatchObject({ removed: true, viaShare: true });
    await expect(readSharedFile('tok', 'resource/a.res')).rejects.toMatchObject({ status: 404 });
  });

  it('files, forks and likes of a removed HUD are refused to a stranger, and a fork and a like to its owner too', async () => {
    const { readFile, forkHud, toggleLike, countDownload } = await import('@/lib/tf2-hud/hud.server');
    await expect(readFile('removed-hud', 'reader', 'resource/a.res')).rejects.toMatchObject({ status: 404 });
    await expect(forkHud('removed-hud', 'reader')).rejects.toMatchObject({ status: 404 });
    await expect(toggleLike('removed-hud', 'reader')).rejects.toMatchObject({ status: 404 });
    await expect(countDownload('removed-hud', 'reader')).rejects.toMatchObject({ status: 404 });
    await expect(forkHud('removed-hud', OWNER)).rejects.toMatchObject({ removed: true });
    await expect(toggleLike('removed-hud', OWNER)).rejects.toMatchObject({ removed: true });
  });

  it('the owner cannot make a removed HUD public, rename it or change its text, but can keep it private', async () => {
    const { updateHud } = await import('@/lib/tf2-hud/hud.server');
    await expect(updateHud({ userId: OWNER, id: 'removed-hud', visibility: 'PUBLIC' })).rejects.toMatchObject({
      removed: true,
    });
    await expect(updateHud({ userId: OWNER, id: 'removed-hud', visibility: 'UNLISTED' })).rejects.toMatchObject({
      removed: true,
    });
    await expect(updateHud({ userId: OWNER, id: 'removed-hud', title: 'New name' })).rejects.toMatchObject({
      removed: true,
    });
    expect(h.updated).toEqual([]);
    const kept = await updateHud({ userId: OWNER, id: 'removed-hud', visibility: 'PRIVATE', title: 'HUD removed-hud' });
    expect(kept).toMatchObject({ removed: true, visibility: 'PRIVATE' });
  });
});

describe('loadouts (lib/tf2-loadout/loadout.server.ts)', () => {
  it('the public list leaves out a removed loadout, a blocked author and a banned one', async () => {
    const { listLoadouts } = await import('@/lib/tf2-loadout/loadout.server');
    h.hidden = ['blocked'];
    const stranger = await listLoadouts({ userId: 'reader', sort: 'new', limit: 20 });
    expect(ids(stranger.items)).toEqual(['live-l']);
    assertJsonSafe(stranger);
  });

  it('the owner list keeps the removed loadout, marked; a stranger cannot open it', async () => {
    const { listLoadouts, getLoadout } = await import('@/lib/tf2-loadout/loadout.server');
    const mine = await listLoadouts({ userId: OWNER, sort: 'new', limit: 20, mine: true });
    expect(mine.items.find((i) => i.id === 'removed-l')).toMatchObject({ removed: true });
    await expect(getLoadout('removed-l', 'reader')).rejects.toMatchObject({ status: 404 });
    await expect(getLoadout('slug-removed-l', null)).rejects.toMatchObject({ status: 404 });
    expect(await getLoadout('removed-l', OWNER)).toMatchObject({ removed: true, isOwner: true });
  });

  it('a removed loadout cannot be forked or liked, even by its owner, or made public or renamed', async () => {
    const { forkLoadout, toggleLike, updateLoadout } = await import('@/lib/tf2-loadout/loadout.server');
    await expect(forkLoadout('removed-l', 'reader')).rejects.toMatchObject({ status: 404 });
    await expect(forkLoadout('removed-l', OWNER)).rejects.toMatchObject({ removed: true });
    await expect(toggleLike('removed-l', OWNER)).rejects.toMatchObject({ removed: true });
    await expect(updateLoadout({ userId: OWNER, id: 'removed-l', visibility: 'PUBLIC' })).rejects.toMatchObject({
      removed: true,
    });
    await expect(updateLoadout({ userId: OWNER, id: 'removed-l', title: 'New name' })).rejects.toMatchObject({
      removed: true,
    });
    expect(h.updated).toEqual([]);
  });
});

describe('the story gallery (GET /api/versecraft/seeds)', () => {
  type Get = (a: { userId: string | null; query: { sort: 'top' | 'new' } }) => Promise<Response>;
  // The route module's first import is slow on a loaded runner; warm it outside the test's own budget.
  beforeAll(async () => {
    await import('@/lib/versecraft/api/versecraft.seeds.server');
  }, 60_000);
  const list = async (userId: string | null) => {
    const { GET } = handlersOfModule<Get>(await import('@/lib/versecraft/api/versecraft.seeds.server'));
    const body = (await (await GET!({ userId, query: { sort: 'new' } })).json()) as { listings: { id: string }[] };
    assertJsonSafe(body);
    return body.listings.map((l) => l.id);
  };

  it('leaves out a removed story, a blocked author and a banned one, for a signed-in reader and a signed-out one', async () => {
    h.hidden = ['blocked'];
    expect(await list('reader')).toEqual(['s-live']);
    h.hidden = [];
    expect(await list(null)).toEqual(['s-live', 's-blocked']);
  });

  it("shows the author's own removed story to nobody, not even to them (it is the record, not a listing)", async () => {
    expect(await list(OWNER)).not.toContain('s-removed');
  });
});

describe('rating a story (POST /api/versecraft/seeds/rate)', () => {
  type Post = (a: { userId: string; body: { listingId: string; stars: number } }) => Promise<Response>;
  beforeAll(async () => {
    await import('@/lib/versecraft/api/versecraft.seeds.rate.server');
  }, 60_000);
  const rate = async (userId: string, listingId: string) => {
    const { POST } = handlersOfModule<Post>(await import('@/lib/versecraft/api/versecraft.seeds.rate.server'));
    return POST!({ userId, body: { listingId, stars: 4 } });
  };

  it('a removed story, and one by a member blocked either way, read as missing', async () => {
    expect((await rate('reader', 's-removed')).status).toBe(404);
    h.hidden = ['blocked'];
    expect((await rate('reader', 's-blocked')).status).toBe(404);
    expect(h.updated).toEqual([]);
  });
});

describe('rating and continuing a removed story', () => {
  it('both read as a missing story', async () => {
    const root = path.resolve(__dirname, '../../..');
    const rate = readFileSync(path.join(root, 'lib/versecraft/api/versecraft.seeds.rate.server.ts'), 'utf8');
    const fork = readFileSync(path.join(root, 'lib/versecraft/api/versecraft.seeds.fork.server.ts'), 'utf8');
    expect(rate).toMatch(/listing\.moderatedAt/);
    expect(fork).toMatch(/moderatedAt:\s*null/);
  });
});

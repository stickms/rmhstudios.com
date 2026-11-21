/**
 * Build releases (s04-04), the mission-critical half: who may publish and delete, who may read, who is told.
 * An in-memory stand-in for Prisma; no database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { RATE_LIMIT_MULTIPLIER } from '@/lib/rate-limit';

type Vis = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
const db = vi.hoisted(() => ({
  builds: [] as { id: string; slug: string; userId: string; title: string; visibility: string }[],
  versions: [] as {
    id: string;
    buildId: string;
    version: string;
    changelog: string | null;
    commitHash: string | null;
    createdAt: Date;
  }[],
  watches: [] as { userId: string; kind: string; targetId: string; level: string }[],
  unlocks: [] as { userId: string; buildId: string }[],
  blocks: [] as { blockerId: string; blockedId: string }[],
  mutes: [] as { muterId: string; mutedId: string }[],
  notifications: [] as { userId: string; preview: string; entityType: string; entityId: string }[],
  seq: 0,
}));
const created = vi.hoisted(() => [] as { userId: string; preview: string; link: string; entityType?: string; dedupeUnread?: boolean }[]);

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    userBuild: {
      findUnique: async ({ where }: { where: { id?: string; slug?: string } }) =>
        db.builds.find((b) => (where.id ? b.id === where.id : b.slug === where.slug)) ?? null,
    },
    buildVersion: {
      create: async ({ data }: { data: { buildId: string; version: string; changelog: string | null; commitHash: string | null } }) => {
        if (db.versions.some((v) => v.buildId === data.buildId && v.version === data.version)) {
          throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
        }
        const row = { id: `v${++db.seq}`, createdAt: new Date(1_700_000_000_000 + db.seq * 1000), ...data };
        db.versions.push(row);
        return row;
      },
      findMany: async ({ where, take }: { where: { buildId: string }; take: number }) =>
        db.versions
          .filter((v) => v.buildId === where.buildId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take),
      deleteMany: async ({ where }: { where: { id: string; buildId: string } }) => {
        const before = db.versions.length;
        db.versions = db.versions.filter((v) => !(v.id === where.id && v.buildId === where.buildId));
        return { count: before - db.versions.length };
      },
    },
    buildUnlock: {
      findMany: async ({ where }: { where: { buildId: string } }) => db.unlocks.filter((u) => u.buildId === where.buildId),
    },
    watch: {
      findMany: async ({ where }: { where: { kind: string; targetId: string; userId?: { not: string } } }) =>
        db.watches.filter(
          (w) => w.kind === where.kind && w.targetId === where.targetId && w.userId !== where.userId?.not,
        ),
    },
    userBlock: {
      findMany: async () => db.blocks,
    },
    userMute: {
      findMany: async () => db.mutes.map((m) => ({ muterId: m.muterId })),
    },
    notification: {
      findMany: async ({ where }: { where: { userId: { in: string[] }; preview: string; entityId: string } }) =>
        db.notifications.filter(
          (n) => where.userId.in.includes(n.userId) && n.preview === where.preview && n.entityId === where.entityId,
        ),
    },
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: { userId: string; preview: string; link: string; entityType?: string; dedupeUnread?: boolean }) => {
    created.push({ userId: n.userId, preview: n.preview, link: n.link, entityType: n.entityType, dedupeUnread: n.dedupeUnread });
  },
}));
vi.mock('@/lib/shop/catalog', () => ({ getShopItem: () => null }));
vi.mock('@/lib/listings/listings.server', () => ({ lowestCosmeticPrice: async () => null }));

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } } }));
vi.mock('@/lib/rmhcode-auth', () => ({
  getAuthenticatedUser: async (request: Request) => {
    const token = request.headers.get('X-RMHCode-Token');
    return token === 'owner-token' ? { id: 'owner' } : token === 'other-token' ? { id: 'other' } : null;
  },
}));

const { createRelease, findReleaseBuild, listReleases, notifyRelease } = await import(
  '@/lib/builds/releases.server'
);
const { route: collection } = await import('@/lib/builds/api/user-builds.$id.releases.server');
const { route: item } = await import('@/lib/builds/api/user-builds.$id.releases.$releaseId.server');

function addBuild(id: string, visibility: Vis, userId = 'owner') {
  db.builds.push({ id, slug: `${id}-slug`, userId, title: `Build ${id}`, visibility });
}

let n = 0;
const call = (
  handler: (a: { request: Request; params: Record<string, string> }) => Promise<Response> | Response,
  params: Record<string, string>,
  init: { method?: string; token?: string; session?: string; body?: unknown } = {},
) =>
  handler({
    params,
    request: new Request('https://rmhstudios.com/api/user-builds/x/releases', {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `10.0.0.${++n % 250}-${Math.random()}`,
        ...(init.token ? { 'X-RMHCode-Token': init.token } : {}),
        ...(init.session ? { cookie: 'better-auth.session_token=abc' } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
  });

beforeEach(() => {
  db.builds = [];
  db.versions = [];
  db.watches = [];
  db.unlocks = [];
  db.blocks = [];
  db.mutes = [];
  db.notifications = [];
  db.seq = 0;
  created.length = 0;
  getSession.mockReset();
  getSession.mockResolvedValue(null);
  addBuild('b1', 'PUBLIC');
});

describe('publishing a release', () => {
  it('lets the owner publish by session and by CLI token, and answers 201', async () => {
    getSession.mockResolvedValue({ user: { id: 'owner' } });
    const bySession = await call(collection.handlers.POST!, { id: 'b1' }, { method: 'POST', session: 'x', body: { version: '1.0' } });
    expect(bySession.status).toBe(201);
    getSession.mockResolvedValue(null);
    const byToken = await call(collection.handlers.POST!, { id: 'b1-slug' }, { method: 'POST', token: 'owner-token', body: { version: '1.1', changelog: 'Faster', commitHash: 'ABCDEF1' } });
    expect(byToken.status).toBe(201);
    const { release } = await byToken.json();
    expect(release).toMatchObject({ version: '1.1', changelog: 'Faster', commitHash: 'abcdef1' });
    expect(db.versions.map((v) => v.version)).toEqual(['1.0', '1.1']);
  });

  it('refuses a signed-out caller with 401 and creates nothing', async () => {
    const res = await call(collection.handlers.POST!, { id: 'b1' }, { method: 'POST', body: { version: '1.0' } });
    expect(res.status).toBe(401);
    expect(db.versions).toHaveLength(0);
  });

  it('refuses a member who is not the owner, by session or by token', async () => {
    getSession.mockResolvedValue({ user: { id: 'other' } });
    const bySession = await call(collection.handlers.POST!, { id: 'b1' }, { method: 'POST', session: 'x', body: { version: '1.0' } });
    expect(bySession.status).toBe(403);
    getSession.mockResolvedValue(null);
    const byToken = await call(collection.handlers.POST!, { id: 'b1' }, { method: 'POST', token: 'other-token', body: { version: '1.0' } });
    expect(byToken.status).toBe(403);
    expect(db.versions).toHaveLength(0);
  });

  it('answers a duplicate version with 409', async () => {
    const body = { version: '2.0' };
    expect((await call(collection.handlers.POST!, { id: 'b1' }, { method: 'POST', token: 'owner-token', body })).status).toBe(201);
    expect((await call(collection.handlers.POST!, { id: 'b1' }, { method: 'POST', token: 'owner-token', body })).status).toBe(409);
    expect(db.versions).toHaveLength(1);
  });

  it('validates every field', async () => {
    for (const body of [
      { version: '' },
      { version: '-1' },
      { version: 'a'.repeat(21) },
      { version: '1.0', changelog: 'x'.repeat(5001) },
      { version: '1.0', commitHash: 'xyz1234' },
      { version: '1.0', commitHash: 'abc12' },
      {},
    ]) {
      const res = await call(collection.handlers.POST!, { id: 'b1' }, { method: 'POST', token: 'owner-token', body });
      expect(res.status).toBe(400);
    }
    expect(db.versions).toHaveLength(0);
  });

  it('rate-limits a member to 10 publishes an hour (before the site-wide multiplier)', async () => {
    const allowed = 10 * RATE_LIMIT_MULTIPLIER;
    let last = 0;
    for (let i = 0; i <= allowed; i++) {
      // The bucket is per member and address: keep the address fixed.
      const res = await collection.handlers.POST!({
        params: { id: 'b1' },
        request: new Request('https://rmhstudios.com/api/user-builds/b1/releases', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', 'X-RMHCode-Token': 'owner-token' },
          body: JSON.stringify({ version: `r${i}` }),
        }),
      });
      last = res.status;
    }
    expect(last).toBe(429);
    expect(db.versions).toHaveLength(allowed);
  });

  it('answers 404 for an unknown build, and 404 (not 403) to a stranger on a private build', async () => {
    addBuild('p1', 'PRIVATE');
    expect((await call(collection.handlers.POST!, { id: 'nope' }, { method: 'POST', token: 'owner-token', body: { version: '1' } })).status).toBe(404);
    expect((await call(collection.handlers.POST!, { id: 'p1' }, { method: 'POST', token: 'other-token', body: { version: '1' } })).status).toBe(404);
  });
});

describe('deleting a release', () => {
  beforeEach(async () => {
    await createRelease(await findReleaseBuild('b1'), 'owner', { version: '1.0' });
  });

  it('is the owner’s alone', async () => {
    const id = db.versions[0]!.id;
    expect((await call(item.handlers.DELETE!, { id: 'b1', releaseId: id }, { method: 'DELETE' })).status).toBe(401);
    expect((await call(item.handlers.DELETE!, { id: 'b1', releaseId: id }, { method: 'DELETE', token: 'other-token' })).status).toBe(403);
    expect(db.versions).toHaveLength(1);
    expect((await call(item.handlers.DELETE!, { id: 'b1', releaseId: id }, { method: 'DELETE', token: 'owner-token' })).status).toBe(200);
    expect(db.versions).toHaveLength(0);
  });

  it('only removes a release of the build in the path', async () => {
    addBuild('b2', 'PUBLIC');
    const id = db.versions[0]!.id;
    const res = await call(item.handlers.DELETE!, { id: 'b2', releaseId: id }, { method: 'DELETE', token: 'owner-token' });
    expect(res.status).toBe(404);
    expect(db.versions).toHaveLength(1);
  });
});

describe('reading releases', () => {
  beforeEach(async () => {
    addBuild('p1', 'PRIVATE');
    addBuild('u1', 'UNLISTED');
    for (const id of ['b1', 'p1', 'u1']) await createRelease(await findReleaseBuild(id), 'owner', { version: '1.0' });
  });

  it('hides a private build’s releases from everyone but the owner', async () => {
    expect((await call(collection.handlers.GET!, { id: 'p1' })).status).toBe(404);
    expect((await call(collection.handlers.GET!, { id: 'p1' }, { token: 'other-token' })).status).toBe(404);
    const own = await call(collection.handlers.GET!, { id: 'p1' }, { token: 'owner-token' });
    expect(own.status).toBe(200);
    expect((await own.json()).items).toHaveLength(1);
    expect(await listReleases('p1', null)).toBeNull();
    expect(await listReleases('p1', 'other')).toBeNull();
  });

  it('shows public and unlisted releases, newest first, with their dates', async () => {
    await createRelease(await findReleaseBuild('b1'), 'owner', { version: '1.1' });
    for (const id of ['b1', 'u1']) {
      const res = await call(collection.handlers.GET!, { id });
      expect(res.status).toBe(200);
    }
    const items = (await (await call(collection.handlers.GET!, { id: 'b1' })).json()).items;
    expect(items.map((r: { version: string }) => r.version)).toEqual(['1.1', '1.0']);
    expect(Date.parse(items[0].createdAt)).toBeGreaterThan(Date.parse(items[1].createdAt));
  });
});

describe('notifying about a release', () => {
  const build = () => findReleaseBuild('b1') as Promise<NonNullable<Awaited<ReturnType<typeof findReleaseBuild>>>>;
  const watch = (userId: string, level: string) => db.watches.push({ userId, kind: 'build', targetId: 'b1', level });

  it('tells watchers at either level and unlockers, each once', async () => {
    watch('all', 'all');
    watch('important', 'important');
    watch('both', 'all');
    db.unlocks.push({ userId: 'both', buildId: 'b1' }, { userId: 'buyer', buildId: 'b1' });
    expect(await notifyRelease(await build(), { version: '2.0' })).toBe(4);
    expect(created.map((c) => c.userId).sort()).toEqual(['all', 'both', 'buyer', 'important']);
    expect(created.every((c) => c.preview === 'Build b1 2.0 is out' && c.link === '/builds/b1-slug#releases')).toBe(true);
  });

  it('skips blocked and muted members, and never tells the owner', async () => {
    watch('blocker', 'all');
    watch('blocked', 'all');
    watch('muter', 'all');
    watch('fan', 'all');
    watch('owner', 'all');
    db.unlocks.push({ userId: 'owner', buildId: 'b1' });
    db.blocks.push({ blockerId: 'blocker', blockedId: 'owner' }, { blockerId: 'owner', blockedId: 'blocked' });
    db.mutes.push({ muterId: 'muter', mutedId: 'owner' });
    await notifyRelease(await build(), { version: '2.0' });
    expect(created.map((c) => c.userId)).toEqual(['fan']);
  });

  it('does not notify for an unlisted or private build', async () => {
    addBuild('u1', 'UNLISTED');
    addBuild('p1', 'PRIVATE');
    for (const id of ['u1', 'p1']) {
      db.watches.push({ userId: 'fan', kind: 'build', targetId: id, level: 'all' });
      db.unlocks.push({ userId: 'buyer', buildId: id });
      expect(await notifyRelease((await findReleaseBuild(id))!, { version: '1.0' })).toBe(0);
    }
    expect(created).toHaveLength(0);
  });

  it('does not tell a member again when a deleted version is published once more', async () => {
    watch('fan', 'all');
    db.notifications.push({ userId: 'fan', preview: 'Build b1 2.0 is out', entityType: 'watch-build-release', entityId: 'b1' });
    watch('late', 'all');
    expect(await notifyRelease(await build(), { version: '2.0' })).toBe(1);
    expect(created.map((c) => c.userId)).toEqual(['late']);
  });

  it('uses its own entity type and never merges into an unread comment notice', async () => {
    watch('fan', 'all');
    await notifyRelease(await build(), { version: '2.0' });
    expect(created[0]).toMatchObject({ entityType: 'watch-build-release', dedupeUnread: false });
  });

  it('caps one release at 500 members', async () => {
    for (let i = 0; i < 600; i++) db.unlocks.push({ userId: `u${i}`, buildId: 'b1' });
    for (let i = 0; i < 600; i++) watch(`w${i}`, 'all');
    expect(await notifyRelease(await build(), { version: '3.0' })).toBe(500);
    expect(created).toHaveLength(500);
  });

  it('publishing through the endpoint notifies once after the write', async () => {
    watch('fan', 'important');
    const res = await call(collection.handlers.POST!, { id: 'b1' }, { method: 'POST', token: 'owner-token', body: { version: '9.0' } });
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(created.map((c) => c.userId)).toEqual(['fan']));
  });
});

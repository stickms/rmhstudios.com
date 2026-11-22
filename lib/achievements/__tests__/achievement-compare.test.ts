import { beforeEach, describe, expect, it, vi } from 'vitest';

// The comparison reads two members and decides what the viewer may see: who can be compared with at all (blocks in
// either direction, bans, deleted accounts and unknown handles are the same 404), and which secrets are masked. A small
// in-memory Prisma stands in for the database.

const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  users: [] as Array<Record<string, unknown>>,
  unlocks: [] as Array<{ userId: string; achievementId: string; progress: number; unlockedAt: Date | null }>,
  blocks: [] as Array<{ blockerId: string; blockedId: string }>,
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => h.users.find((u) => u.id === where.id) ?? null),
      findFirst: vi.fn(
        async ({ where }: { where: { OR: Array<{ id?: string; handle?: string }> } }) =>
          h.users.find((u) => where.OR.some((c) => (c.id && c.id === u.id) || (c.handle && c.handle === u.handle))) ??
          null,
      ),
    },
    userAchievement: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        h.unlocks.filter((r) => r.userId === where.userId),
      ),
    },
    achievementRarity: { findMany: vi.fn(async () => [{ achievementId: 'social.first_post', pct: 0.04 }]) },
    userBlock: {
      findFirst: vi.fn(
        async ({ where }: { where: { OR: Array<{ blockerId: string; blockedId: string }> } }) =>
          h.blocks.find((b) => where.OR.some((c) => c.blockerId === b.blockerId && c.blockedId === b.blockedId)) ??
          null,
      ),
    },
  },
}));

import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import { route } from '@/lib/achievements/api/achievements.compare.server';

const SECRET = ACHIEVEMENTS.find((a) => a.secret)!;
const user = (id: string, handle: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: handle,
  image: null,
  username: handle,
  handle,
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: null,
  inventory: [],
  bannedUntil: null,
  deletionScheduledAt: null,
  ...extra,
});
const unlock = (userId: string, achievementId: string) => ({
  userId,
  achievementId,
  progress: 1,
  unlockedAt: new Date('2026-05-03T00:00:00Z'),
});

type Handlers = Record<string, (a: { request: Request; params: Record<string, string> }) => Promise<Response>>;
const get = (withValue: string, signedCookie = true) =>
  (route.handlers as Handlers).GET!({
    request: new Request(`https://rmhstudios.com/api/achievements/compare?with=${encodeURIComponent(withValue)}`, {
      headers: {
        'cf-connecting-ip': `${Math.random()}`,
        ...(signedCookie ? { cookie: 'better-auth.session_token=abc' } : {}),
      },
    }),
    params: {},
  });

beforeEach(() => {
  h.session = { user: { id: 'me' } };
  h.users = [user('me', 'me'), user('u2', 'alex')];
  h.unlocks = [];
  h.blocks = [];
});

describe('GET /api/achievements/compare', () => {
  it('refuses a signed-out caller', async () => {
    h.session = null;
    expect((await get('alex', false)).status).toBe(401);
  });

  it('rejects a malformed `with` before any lookup', async () => {
    expect((await get('a b/c')).status).toBe(400);
  });

  it('compares with a member by handle and by id, privately', async () => {
    h.unlocks = [unlock('me', 'social.first_post'), unlock('u2', 'social.first_post')];
    const byHandle = await get('alex');
    expect(byHandle.status).toBe(200);
    expect(byHandle.headers.get('cache-control')).toBe('private, no-store');
    const body = await byHandle.json();
    expect(body.them.handle).toBe('alex');
    expect(body.rows.find((r: { id: string }) => r.id === 'social.first_post')).toMatchObject({
      bucket: 'both',
      rarity: 0.04,
    });
    expect((await get('u2')).status).toBe(200);
  });

  it.each([
    ['an unknown handle', 'nobody', () => {}],
    ['a block by the viewer', 'alex', () => h.blocks.push({ blockerId: 'me', blockedId: 'u2' })],
    ['a block by the other member', 'alex', () => h.blocks.push({ blockerId: 'u2', blockedId: 'me' })],
    ['a banned member', 'alex', () => (h.users[1] = user('u2', 'alex', { bannedUntil: new Date(Date.now() + 1e9) }))],
    [
      'an account scheduled for deletion',
      'alex',
      () => (h.users[1] = user('u2', 'alex', { deletionScheduledAt: new Date() })),
    ],
    ['the viewer themselves', 'me', () => {}],
  ])('answers the same 404 for %s', async (_name, withValue, arrange) => {
    arrange();
    const res = await get(withValue);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'No one to compare with' });
  });

  it('compares with a member whose ban has expired', async () => {
    h.users[1] = user('u2', 'alex', { bannedUntil: new Date(Date.now() - 1000) });
    expect((await get('alex')).status).toBe(200);
  });

  it('masks a secret only the other member unlocked, and sends nothing that names it', async () => {
    h.unlocks = [unlock('u2', SECRET.id)];
    const res = await get('alex');
    const text = await res.text();
    const row = JSON.parse(text).rows.find((r: { id: string }) => r.id === SECRET.id);
    expect(row).toMatchObject({ masked: true, name: '', description: '', icon: '', rarity: null, trackable: false });
    expect(text).not.toContain(SECRET.name);
    expect(text).not.toContain(SECRET.description);
  });

  it('shows a secret the viewer unlocked, and omits one nobody unlocked', async () => {
    h.unlocks = [unlock('me', SECRET.id)];
    const rows = (await (await get('alex')).json()).rows as Array<{ id: string; name: string; masked: boolean }>;
    expect(rows.find((r) => r.id === SECRET.id)).toMatchObject({ masked: false, name: SECRET.name });
    h.unlocks = [];
    const none = (await (await get('alex')).json()).rows as Array<{ id: string }>;
    expect(none.some((r) => ACHIEVEMENTS.find((a) => a.id === r.id)?.secret)).toBe(false);
  });
});

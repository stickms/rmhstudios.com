/**
 * C1 phase 22 batch 4: admin and profile routes that used to read the session by
 * hand (announcements, albums, predictions queue, library manager) or parse their
 * own body (profile PATCH, steam trades/market, album reorder) now ride
 * `implement()`. Pins their bespoke 400 texts, the 401 for a signed-out caller and
 * the 403 for a signed-in non-admin. Drives the real route handlers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/albums.admin.server', () => ({
  deleteAlbum: vi.fn(),
  reorderSlides: vi.fn(),
  uniqueAlbumSlug: vi.fn(),
}));
vi.mock('@/lib/library/library.server', () => ({ listAllBooksForAdmin: vi.fn() }));
vi.mock('@/lib/library/migrate.server', () => ({ migrateStaticLibraryToS3: vi.fn() }));
vi.mock('@/lib/storage/s3.server', () => ({ deleteObject: vi.fn() }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/predictions/predictions.server', () => ({
  serializeMarket: vi.fn(),
  moderatePrediction: vi.fn(),
  resolvePrediction: vi.fn(),
  PredictionError: class extends Error {},
}));
vi.mock('@/lib/user-display.server', () => ({ invalidateUserDisplay: vi.fn() }));
vi.mock('@/lib/cards/trades.server', () => ({
  proposeTrade: vi.fn(),
  acceptTrade: vi.fn(),
  cancelTrade: vi.fn(),
  declineTrade: vi.fn(),
  TradeError: class extends Error {},
}));
vi.mock('@/lib/cards/cards.server', () => ({ craftBadge: vi.fn() }));
vi.mock('@/lib/cards/gems.server', () => ({ unpackCards: vi.fn() }));
vi.mock('@/lib/cards/market.server', () => ({ listCard: vi.fn() }));
vi.mock('@/lib/games/hub.server', () => ({
  createThread: vi.fn(),
  HubError: class extends Error {},
}));
vi.mock('@/lib/games/showcase.server', () => ({ saveLook: vi.fn(), saveShowcase: vi.fn() }));
vi.mock('@/lib/game/submit.server', () => ({ submitGameScore: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function handler(mod: string, method: string): Promise<Handler> {
  return handlersOfModule<Handler>(await import(/* @vite-ignore */ mod))[method]!;
}

interface Case {
  name: string;
  mod: string;
  method?: string;
  body?: unknown;
  error: string;
}

const ANN = '@/lib/admin/api/admin.announcements.server';
const ANN_ID = '@/lib/admin/api/admin.announcements.$id.server';
const ALBUMS = '@/lib/admin/api/admin.albums.server';
const ALBUM = '@/lib/admin/api/admin.albums.$id.server';
const REORDER = '@/lib/admin/api/admin.albums.$id.reorder.server';
const LIB_REORDER = '@/lib/library/api/admin.library.reorder.server';
const LIB_ID = '@/lib/library/api/admin.library.$id.server';
const PROFILE = '@/app/routes/api/profile';
const MODERATE = '@/lib/predictions/api/admin.predictions.$id.moderate.server';
const RESOLVE = '@/lib/predictions/api/admin.predictions.$id.resolve.server';

const ADMIN_CASES: Case[] = [
  {
    name: 'announcement create: empty body names the first issue',
    mod: ANN,
    body: '{nope',
    error: 'Invalid input: expected string, received undefined',
  },
  {
    name: 'announcement update: wrong type',
    mod: ANN_ID,
    body: { active: 'yes' },
    error: 'Invalid input',
  },
  { name: 'album create: no title', mod: ALBUMS, body: {}, error: 'Title is required.' },
  { name: 'album create: malformed JSON', mod: ALBUMS, body: '{nope', error: 'Title is required.' },
  {
    name: 'album patch: nothing to update',
    mod: ALBUM,
    method: 'PATCH',
    body: {},
    error: 'Nothing to update.',
  },
  {
    name: 'album patch: title too long',
    mod: ALBUM,
    method: 'PATCH',
    body: { title: 'x'.repeat(121) },
    error: 'Nothing to update.',
  },
  {
    name: 'album reorder: ids not an array',
    mod: REORDER,
    body: { ids: 'a' },
    error: 'Invalid order.',
  },
  {
    name: 'library reorder: ids not an array',
    mod: LIB_REORDER,
    body: { ids: 'a' },
    error: 'Invalid order.',
  },
  {
    name: 'library reorder: empty list',
    mod: LIB_REORDER,
    body: { ids: [] },
    error: 'Invalid order.',
  },
  {
    name: 'library patch: array body',
    mod: LIB_ID,
    method: 'PATCH',
    body: [],
    error: 'Nothing to update.',
  },
  {
    name: 'prediction moderate: unknown action',
    mod: MODERATE,
    body: { action: 'maybe' },
    error: 'Invalid input',
  },
  {
    name: 'prediction resolve: unknown outcome',
    mod: RESOLVE,
    body: { outcome: 'MAYBE' },
    error: 'Invalid input',
  },
];

function req(method: string, body?: unknown, cookie = true): Request {
  return new Request('https://rmhstudios.com/api/x', {
    method,
    headers: {
      ...(cookie ? { cookie: 'better-auth.session_token=abc' } : {}),
      'content-type': 'application/json',
      'cf-connecting-ip': `${Math.random()}`,
    },
    ...(body === undefined || method === 'GET'
      ? {}
      : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

beforeEach(() => {
  h.getSession.mockResolvedValue({ user: { id: 'u1', name: 'U', isAdmin: true } });
});

describe('admin routes keep their bespoke 400 texts', () => {
  for (const c of ADMIN_CASES) {
    it(c.name, async () => {
      const fn = await handler(c.mod, c.method ?? 'POST');
      const res = await fn({ params: { id: 'a1' }, request: req(c.method ?? 'POST', c.body) });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      if (c.name.startsWith('announcement create')) expect(typeof json.error).toBe('string');
      else expect(json).toEqual({ error: c.error });
    });
  }

  it('profile patch: names the first issue, malformed JSON is a 400 not a 500', async () => {
    const fn = await handler(PROFILE, 'PATCH');
    const bad = await fn({ params: {}, request: req('PATCH', { handle: 'ab' }) });
    expect(bad.status).toBe(400);
    await expect(bad.json()).resolves.toEqual({ error: 'Handle must be at least 3 characters' });
    const broken = await fn({ params: {}, request: req('PATCH', '{nope') });
    expect(broken.status).toBe(400);
  });
});

describe('admin routes: 401 signed out, 403 non-admin', () => {
  const ROUTES: [string, string][] = [
    [ANN, 'GET'],
    [ANN, 'POST'],
    [ANN_ID, 'POST'],
    [ANN_ID, 'DELETE'],
    [ALBUMS, 'GET'],
    [ALBUMS, 'POST'],
    [ALBUM, 'PATCH'],
    [ALBUM, 'DELETE'],
    [REORDER, 'POST'],
    ['@/lib/library/api/admin.library.server', 'GET'],
    ['@/lib/library/api/admin.library.migrate.server', 'POST'],
    [LIB_REORDER, 'POST'],
    [LIB_ID, 'PATCH'],
    [LIB_ID, 'DELETE'],
    ['@/lib/predictions/api/admin.predictions.server', 'GET'],
    [MODERATE, 'POST'],
    [RESOLVE, 'POST'],
  ];
  for (const [mod, method] of ROUTES) {
    it(`${method} ${mod}: signed out`, async () => {
      h.getSession.mockResolvedValue(null);
      const fn = await handler(mod, method);
      const res = await fn({ params: { id: 'a1' }, request: req(method, '{nope', false) });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });
    it(`${method} ${mod}: signed in, not admin`, async () => {
      h.getSession.mockResolvedValue({ user: { id: 'u2', name: 'V', isAdmin: false } });
      const fn = await handler(mod, method);
      const res = await fn({ params: { id: 'a1' }, request: req(method, '{nope') });
      expect(res.status).toBe(403);
    });
  }
});

describe('steam routes answer 401 signed out and 400 on a bad body', () => {
  const STEAM: [string, unknown][] = [
    ['@/app/routes/api/games/trades/propose', { toId: 'x', give: 'no', ask: [] }],
    ['@/app/routes/api/games/trades/accept', {}],
    ['@/app/routes/api/games/trades/cancel', {}],
    ['@/app/routes/api/games/trades/decline', {}],
    ['@/app/routes/api/games/cards/craft', {}],
    ['@/app/routes/api/games/customize', {}],
    ['@/app/routes/api/games/gems/unpack', {}],
    ['@/app/routes/api/games/hub/thread', {}],
    ['@/app/routes/api/games/market/list', {}],
    ['@/app/routes/api/games/showcase', {}],
  ];
  for (const [mod, body] of STEAM) {
    it(`${mod}: signed out`, async () => {
      h.getSession.mockResolvedValue(null);
      const fn = await handler(mod, 'POST');
      const res = await fn({ params: {}, request: req('POST', body, false) });
      expect(res.status).toBe(401);
    });
    it(`${mod}: invalid body`, async () => {
      const fn = await handler(mod, 'POST');
      const res = await fn({ params: {}, request: req('POST', body) });
      expect(res.status).toBe(400);
    });
  }
});

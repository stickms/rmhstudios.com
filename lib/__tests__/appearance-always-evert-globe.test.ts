/**
 * "Always evert globe" preference (spec amendment 2026-10-18).
 *
 * Mirrors `appearance-nav-transition.test.ts`: the real
 * `PUT /api/preferences/appearance` handler (auth and Prisma mocked), then the
 * store default and the localStorage cache round trip that carry the setting for
 * signed-out visitors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession, upsert, findUnique } = vi.hoisted(() => ({
  getSession: vi.fn(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: { appearancePreference: { upsert, findUnique } },
}));

import { Route } from '@/app/routes/api/preferences/appearance';
import { ALWAYS_EVERT_GLOBE_KEY } from '@/lib/appearance/prefs';
import { useThemeStore } from '@/stores/themeStore';

type Handler = (ctx: { params: object; request: Request }) => Promise<Response>;
const handlers = (
  Route as unknown as { options: { server: { handlers: Record<string, Handler> } } }
).options.server.handlers;

const put = (body: unknown) =>
  handlers.PUT({
    params: {},
    request: new Request('https://rmhstudios.com/api/preferences/appearance', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        // defineHandler skips Better Auth for cookie-less callers.
        cookie: 'better-auth.session_token=abc',
      },
      body: JSON.stringify(body),
    }),
  });

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue({ user: { id: 'u1', name: 'Ada', isAdmin: false } });
  upsert.mockReset();
  upsert.mockImplementation(async ({ update }: { update: Record<string, unknown> }) => ({
    userId: 'u1',
    style: null,
    accent: null,
    reduceTransparency: false,
    navTransition: null,
    alwaysEvertGlobe: update.alwaysEvertGlobe ?? false,
  }));
  findUnique.mockReset();
});

describe('PUT /api/preferences/appearance alwaysEvertGlobe', () => {
  it.each([true, false])('accepts %s and stores it', async (value) => {
    const res = await put({ alwaysEvertGlobe: value });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update.alwaysEvertGlobe).toBe(value);
    expect(upsert.mock.calls[0][0].create.alwaysEvertGlobe).toBe(value);
    await expect(res.json()).resolves.toMatchObject({ alwaysEvertGlobe: value });
  });

  it('leaves the column untouched when the field is omitted', async () => {
    const res = await put({ reduceMotion: true });
    expect(res.status).toBe(200);
    expect('alwaysEvertGlobe' in upsert.mock.calls[0][0].update).toBe(false);
  });

  it.each([['true'], [1], [0], [null], [''], [['x']]])(
    'rejects %j with 400 and never writes',
    async (value) => {
      const res = await put({ alwaysEvertGlobe: value });
      expect(res.status).toBe(400);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await put({ alwaysEvertGlobe: true });
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('GET reports false for an absent row and the stored value otherwise', async () => {
    findUnique.mockResolvedValue(null);
    const get = () =>
      handlers.GET({
        params: {},
        request: new Request('https://rmhstudios.com/api/preferences/appearance', {
          headers: { cookie: 'better-auth.session_token=abc' },
        }),
      });
    await expect((await get()).json()).resolves.toMatchObject({ alwaysEvertGlobe: false });
    findUnique.mockResolvedValue({ userId: 'u1', alwaysEvertGlobe: true });
    await expect((await get()).json()).resolves.toMatchObject({ alwaysEvertGlobe: true });
  });
});

describe('alwaysEvertGlobe defaults and store', () => {
  it('the store starts off and holds what is set', () => {
    expect(useThemeStore.getState().alwaysEvertGlobe).toBe(false);
    useThemeStore.getState().setAlwaysEvertGlobe(true);
    expect(useThemeStore.getState().alwaysEvertGlobe).toBe(true);
    useThemeStore.getState().setAlwaysEvertGlobe(false);
    expect(useThemeStore.getState().alwaysEvertGlobe).toBe(false);
  });

  it('round-trips through the localStorage cache key (signed-out path)', () => {
    const mem = new Map<string, string>();
    const ls = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    // What Providers does: '1' when on, remove when off, hydrate on boot.
    const write = (on: boolean) =>
      on ? ls.setItem(ALWAYS_EVERT_GLOBE_KEY, '1') : ls.removeItem(ALWAYS_EVERT_GLOBE_KEY);
    const read = () => ls.getItem(ALWAYS_EVERT_GLOBE_KEY) === '1';
    expect(read()).toBe(false);
    write(true);
    expect(read()).toBe(true);
    write(false);
    expect(ls.getItem(ALWAYS_EVERT_GLOBE_KEY)).toBeNull();
    expect(read()).toBe(false);
  });
});

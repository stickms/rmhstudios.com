/**
 * Globe-eversion navigation transition preference (spec §9.3, S#24).
 *
 * Drives the real `PUT /api/preferences/appearance` handler (auth mocked,
 * Prisma mocked) so the contract tested is the one the browser hits: the six
 * `NAV_TRANSITIONS` values and `null` are accepted, anything else is a 400 that
 * never reaches the database. The store half pins the other two promises of
 * T20: an absent value means `random`, and the localStorage cache round-trips.
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
import { NAV_TRANSITIONS } from '@/lib/eversion/types';
import {
  DEFAULT_NAV_TRANSITION,
  NAV_TRANSITION_KEY,
  isNavTransition,
  resolveNavTransition,
} from '@/lib/appearance/prefs';
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
    navTransition: update.navTransition ?? null,
  }));
  findUnique.mockReset();
});

describe('PUT /api/preferences/appearance navTransition (S#24)', () => {
  it('has exactly the six spec values', () => {
    expect([...NAV_TRANSITIONS]).toEqual([
      'random',
      'mercator',
      'peirce',
      'stereographic',
      'lambert',
      'equirect',
    ]);
  });

  it.each([...NAV_TRANSITIONS])('accepts %s and stores it', async (value) => {
    const res = await put({ navTransition: value });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update.navTransition).toBe(value);
    await expect(res.json()).resolves.toMatchObject({ navTransition: value });
  });

  it('accepts null (clears back to the default)', async () => {
    const res = await put({ navTransition: null });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update.navTransition).toBeNull();
  });

  it('leaves the column untouched when the field is omitted', async () => {
    const res = await put({ reduceMotion: true });
    expect(res.status).toBe(200);
    expect('navTransition' in upsert.mock.calls[0][0].update).toBe(false);
  });

  it.each([['spherical'], ['RANDOM'], [''], [1], [true], [['random']]])(
    'rejects %j with 400 and never writes',
    async (value) => {
      const res = await put({ navTransition: value });
      expect(res.status).toBe(400);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('GET reports null for an absent row', async () => {
    findUnique.mockResolvedValue(null);
    const res = await handlers.GET({
      params: {},
      request: new Request('https://rmhstudios.com/api/preferences/appearance', {
        headers: { cookie: 'better-auth.session_token=abc' },
      }),
    });
    await expect(res.json()).resolves.toMatchObject({ navTransition: null });
  });
});

describe('navTransition defaults and store', () => {
  it('an absent or unknown value resolves to random', () => {
    expect(DEFAULT_NAV_TRANSITION).toBe('mercator');
    expect(resolveNavTransition(null)).toBe('mercator');
    expect(resolveNavTransition(undefined)).toBe('mercator');
    expect(resolveNavTransition('wobble')).toBe('mercator');
    expect(resolveNavTransition('peirce')).toBe('peirce');
    expect(isNavTransition('lambert')).toBe(true);
    expect(isNavTransition('nope')).toBe(false);
  });

  it('the store starts at Mercator and holds what is set', () => {
    expect(useThemeStore.getState().navTransition).toBe('mercator');
    useThemeStore.getState().setNavTransition('random');
    expect(useThemeStore.getState().navTransition).toBe('random');
    useThemeStore.getState().setNavTransition('mercator');
  });

  it('round-trips through the localStorage cache key', () => {
    const mem = new Map<string, string>();
    const ls = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    // What Providers does: write non-default, remove default, hydrate on boot.
    const write = (v: string) =>
      v !== DEFAULT_NAV_TRANSITION
        ? ls.setItem(NAV_TRANSITION_KEY, v)
        : ls.removeItem(NAV_TRANSITION_KEY);
    write('stereographic');
    expect(resolveNavTransition(ls.getItem(NAV_TRANSITION_KEY))).toBe('stereographic');
    write('random');
    expect(resolveNavTransition(ls.getItem(NAV_TRANSITION_KEY))).toBe('random');
    write('mercator');
    expect(ls.getItem(NAV_TRANSITION_KEY)).toBeNull();
    expect(resolveNavTransition(ls.getItem(NAV_TRANSITION_KEY))).toBe('mercator');
  });
});

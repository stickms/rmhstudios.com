/**
 * Eversion level preference (amended 2026-10-21): `all` (default) or `globe`.
 * Same shape as appearance-nav-transition.test.ts: the real PUT/GET handler
 * (auth + Prisma mocked), then the store and the localStorage cache contract.
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
import {
  DEFAULT_EVERSION_LEVEL,
  EVERSION_LEVELS,
  EVERSION_LEVEL_KEY,
  isEversionLevel,
  resolveEversionLevel,
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
    eversionLevel: update.eversionLevel ?? null,
  }));
  findUnique.mockReset();
});

describe('PUT /api/preferences/appearance eversionLevel', () => {
  it('has exactly the two values, all first', () => {
    expect([...EVERSION_LEVELS]).toEqual(['all', 'globe']);
    expect(DEFAULT_EVERSION_LEVEL).toBe('all');
  });

  it.each([...EVERSION_LEVELS])('accepts %s and stores it', async (value) => {
    const res = await put({ eversionLevel: value });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update.eversionLevel).toBe(value);
    await expect(res.json()).resolves.toMatchObject({ eversionLevel: value });
  });

  it('accepts null (clears back to the default)', async () => {
    const res = await put({ eversionLevel: null });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update.eversionLevel).toBeNull();
  });

  it('leaves the column untouched when the field is omitted', async () => {
    const res = await put({ reduceMotion: true });
    expect(res.status).toBe(200);
    expect('eversionLevel' in upsert.mock.calls[0][0].update).toBe(false);
  });

  it.each([['everything'], ['ALL'], [''], [1], [true], [['all']]])(
    'rejects %j with 400 and never writes',
    async (value) => {
      const res = await put({ eversionLevel: value });
      expect(res.status).toBe(400);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('GET reports null for an absent row, and the stored value otherwise', async () => {
    const get = () =>
      handlers.GET({
        params: {},
        request: new Request('https://rmhstudios.com/api/preferences/appearance', {
          headers: { cookie: 'better-auth.session_token=abc' },
        }),
      });
    findUnique.mockResolvedValue(null);
    await expect((await get()).json()).resolves.toMatchObject({ eversionLevel: null });
    findUnique.mockResolvedValue({ userId: 'u1', eversionLevel: 'globe' });
    await expect((await get()).json()).resolves.toMatchObject({ eversionLevel: 'globe' });
  });
});

describe('eversionLevel defaults and store', () => {
  it('an absent or unknown value resolves to all', () => {
    expect(resolveEversionLevel(null)).toBe('all');
    expect(resolveEversionLevel(undefined)).toBe('all');
    expect(resolveEversionLevel('wobble')).toBe('all');
    expect(resolveEversionLevel('globe')).toBe('globe');
    expect(isEversionLevel('globe')).toBe(true);
    expect(isEversionLevel('nope')).toBe(false);
  });

  it('the store starts at all and holds what is set', () => {
    expect(useThemeStore.getState().eversionLevel).toBe('all');
    useThemeStore.getState().setEversionLevel('globe');
    expect(useThemeStore.getState().eversionLevel).toBe('globe');
    useThemeStore.getState().setEversionLevel('all');
  });

  it('round-trips through the localStorage cache key (default = absent)', () => {
    const mem = new Map<string, string>();
    const ls = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const write = (v: string) =>
      v !== DEFAULT_EVERSION_LEVEL
        ? ls.setItem(EVERSION_LEVEL_KEY, v)
        : ls.removeItem(EVERSION_LEVEL_KEY);
    write('globe');
    expect(EVERSION_LEVEL_KEY).toBe('rmh-eversion-level');
    expect(resolveEversionLevel(ls.getItem(EVERSION_LEVEL_KEY))).toBe('globe');
    write('all');
    expect(ls.getItem(EVERSION_LEVEL_KEY)).toBeNull();
    expect(resolveEversionLevel(ls.getItem(EVERSION_LEVEL_KEY))).toBe('all');
  });
});

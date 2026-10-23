/**
 * "Jelly motion" preference (Plasmatic Jelly R8, plan 04 §4.2; WCAG 2.2.2).
 *
 * Modelled on `appearance-nav-transition.test.ts`: drives the real
 * `PUT /api/preferences/appearance` handler (auth and Prisma mocked), then checks
 * that the value list, the zod schema, the account seed, the store, the DOM
 * applier and the pre-paint script in `app/routes/__root.tsx` all agree.
 *
 * Contract: `html[data-jelly-motion]` and the `rmh-jelly-motion` localStorage key are present
 * only for a non-default value; the default (`lively`) is expressed by absence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  JELLY_MOTION_LEVELS,
  DEFAULT_JELLY_MOTION,
  JELLY_MOTION_KEY,
  isJellyMotion,
  resolveJellyMotion,
  applyJellyMotion,
} from '@/lib/appearance/prefs';
import { appearanceComfortSchema } from '@/lib/appearance/prefs-schema';
import { accountAppearanceSeed } from '@/lib/appearance/account-seed';
import { useThemeStore } from '@/stores/themeStore';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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

const get = () =>
  handlers.GET({
    params: {},
    request: new Request('https://rmhstudios.com/api/preferences/appearance', {
      headers: { cookie: 'better-auth.session_token=abc' },
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
    jellyMotion: update.jellyMotion ?? null,
  }));
  findUnique.mockReset();
});

describe('PUT /api/preferences/appearance jellyMotion', () => {
  it('has exactly the plan values, default first', () => {
    expect([...JELLY_MOTION_LEVELS]).toEqual(['lively', 'calm', 'still']);
    expect(DEFAULT_JELLY_MOTION).toBe('lively');
    expect(JELLY_MOTION_KEY).toBe('rmh-jelly-motion');
  });

  it.each([...JELLY_MOTION_LEVELS])('accepts %s and stores it', async (value) => {
    const res = await put({ jellyMotion: value });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update.jellyMotion).toBe(value);
    expect(upsert.mock.calls[0][0].create.jellyMotion).toBe(value);
    await expect(res.json()).resolves.toMatchObject({ jellyMotion: value });
  });

  it('accepts null (clears back to the default)', async () => {
    const res = await put({ jellyMotion: null });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update.jellyMotion).toBeNull();
  });

  it('leaves the column untouched when omitted, and never revives reduceMotion', async () => {
    const res = await put({ reduceMotion: true });
    expect(res.status).toBe(200);
    const { create, update } = upsert.mock.calls[0][0];
    expect('jellyMotion' in update).toBe(false);
    expect('reduceMotion' in update).toBe(false);
    expect('reduceMotion' in create).toBe(false);
  });

  it.each([['LIVELY'], ['reduce'], [''], [1], [true], [['still']]])(
    'rejects %j with 400 and never writes',
    async (value) => {
      const res = await put({ jellyMotion: value });
      expect(res.status).toBe(400);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await put({ jellyMotion: 'still' });
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('GET reports null for an absent row and the stored value otherwise', async () => {
    findUnique.mockResolvedValue(null);
    await expect((await get()).json()).resolves.toMatchObject({ jellyMotion: null });
    findUnique.mockResolvedValue({ userId: 'u1', jellyMotion: 'still' });
    await expect((await get()).json()).resolves.toMatchObject({ jellyMotion: 'still' });
  });

  it('the shared schema agrees with the value list', () => {
    for (const v of JELLY_MOTION_LEVELS)
      expect(appearanceComfortSchema.safeParse({ jellyMotion: v }).success).toBe(true);
    expect(appearanceComfortSchema.safeParse({ jellyMotion: 'nope' }).success).toBe(false);
  });
});

describe('jellyMotion resolution, store, seed and applier', () => {
  it('an absent or unknown value resolves to the default', () => {
    expect(resolveJellyMotion(null)).toBe('lively');
    expect(resolveJellyMotion(undefined)).toBe('lively');
    expect(resolveJellyMotion('wobble')).toBe('lively');
    expect(resolveJellyMotion('still')).toBe('still');
    expect(isJellyMotion('still')).toBe(true);
    expect(isJellyMotion('nope')).toBe(false);
  });

  it('the store starts at the default and holds what is set', () => {
    const st = useThemeStore.getState();
    expect(st.jellyMotion).toBe('lively');
    st.setJellyMotion('still');
    expect(useThemeStore.getState().jellyMotion).toBe('still');
    // An unknown value (e.g. from an older/newer client) resolves to the default.
    st.setJellyMotion('bogus' as never);
    expect(useThemeStore.getState().jellyMotion).toBe('lively');
  });

  it('the account seed writes non-defaults, clears the default, and skips null', () => {
    expect(accountAppearanceSeed({ jellyMotion: 'still' })).toEqual({
      'rmh-jelly-motion': 'still',
    });
    expect(accountAppearanceSeed({ jellyMotion: 'lively' })).toEqual({ 'rmh-jelly-motion': null });
    expect(accountAppearanceSeed({ jellyMotion: null })).not.toHaveProperty('rmh-jelly-motion');
    expect(accountAppearanceSeed({ jellyMotion: 'bogus' })).not.toHaveProperty('rmh-jelly-motion');
  });

  it('the applier sets the attribute for non-defaults and removes it for the default', () => {
    const attrs = new Map<string, string>();
    const html = {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    } as unknown as HTMLElement;
    for (const v of JELLY_MOTION_LEVELS) {
      applyJellyMotion(html, v);
      if (v === DEFAULT_JELLY_MOTION) expect(attrs.has('data-jelly-motion')).toBe(false);
      else expect(attrs.get('data-jelly-motion')).toBe(v);
    }
  });

  it('the pre-paint script stamps exactly the non-default values from the cache key', () => {
    const root = readFileSync(join(REPO, 'app/routes/__root.tsx'), 'utf8');
    const nonDefaults = JELLY_MOTION_LEVELS.filter((v) => v !== DEFAULT_JELLY_MOTION);
    expect(root).toContain(`localStorage.getItem("rmh-jelly-motion")`);
    expect(root).toContain(`setAttribute("data-jelly-motion"`);
    const cond = nonDefaults.map((v) => `jm==="${v}"`).join('||');
    expect(root).toContain(
      `if(${cond}){document.documentElement.setAttribute("data-jelly-motion",jm)}`,
    );
  });

  it('round-trips through the localStorage cache key (signed-out path)', () => {
    const mem = new Map<string, string>();
    const ls = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    // What Providers does: write non-default, remove default, hydrate on boot.
    const write = (v: string) =>
      v !== DEFAULT_JELLY_MOTION
        ? ls.setItem(JELLY_MOTION_KEY, v)
        : ls.removeItem(JELLY_MOTION_KEY);
    for (const v of JELLY_MOTION_LEVELS) {
      write(v);
      expect(resolveJellyMotion(ls.getItem(JELLY_MOTION_KEY))).toBe(v);
    }
    write(DEFAULT_JELLY_MOTION);
    expect(ls.getItem(JELLY_MOTION_KEY)).toBeNull();
  });
});

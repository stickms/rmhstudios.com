/**
 * "Electric arcs" preference (Plasmatic Jelly R9, plan 03 §5).
 *
 * Modelled on `appearance-nav-transition.test.ts`: drives the real
 * `PUT /api/preferences/appearance` handler (auth and Prisma mocked), then checks
 * that the value list, the zod schema, the account seed, the store, the DOM
 * applier and the pre-paint script in `app/routes/__root.tsx` all agree.
 *
 * Contract: `html[data-electric-arcs]` and the `rmh-electric-arcs` localStorage key are present
 * only for a non-default value; the default (`full`) is expressed by absence.
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
  ELECTRIC_ARC_MODES,
  DEFAULT_ELECTRIC_ARCS,
  ELECTRIC_ARCS_KEY,
  isElectricArcs,
  resolveElectricArcs,
  applyElectricArcs,
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
    electricArcs: update.electricArcs ?? null,
  }));
  findUnique.mockReset();
});

describe('PUT /api/preferences/appearance electricArcs', () => {
  it('has exactly the plan values, default first', () => {
    expect([...ELECTRIC_ARC_MODES]).toEqual(['full', 'clicks', 'off']);
    expect(DEFAULT_ELECTRIC_ARCS).toBe('full');
    expect(ELECTRIC_ARCS_KEY).toBe('rmh-electric-arcs');
  });

  it.each([...ELECTRIC_ARC_MODES])('accepts %s and stores it', async (value) => {
    const res = await put({ electricArcs: value });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update.electricArcs).toBe(value);
    expect(upsert.mock.calls[0][0].create.electricArcs).toBe(value);
    await expect(res.json()).resolves.toMatchObject({ electricArcs: value });
  });

  it('accepts null (clears back to the default)', async () => {
    const res = await put({ electricArcs: null });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update.electricArcs).toBeNull();
  });

  it('leaves the column untouched when omitted, and never revives reduceMotion', async () => {
    const res = await put({ reduceMotion: true });
    expect(res.status).toBe(200);
    const { create, update } = upsert.mock.calls[0][0];
    expect('electricArcs' in update).toBe(false);
    expect('reduceMotion' in update).toBe(false);
    expect('reduceMotion' in create).toBe(false);
  });

  it.each([['FULL'], ['none'], [''], [0], [false], [['off']]])(
    'rejects %j with 400 and never writes',
    async (value) => {
      const res = await put({ electricArcs: value });
      expect(res.status).toBe(400);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await put({ electricArcs: 'clicks' });
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('GET reports null for an absent row and the stored value otherwise', async () => {
    findUnique.mockResolvedValue(null);
    await expect((await get()).json()).resolves.toMatchObject({ electricArcs: null });
    findUnique.mockResolvedValue({ userId: 'u1', electricArcs: 'clicks' });
    await expect((await get()).json()).resolves.toMatchObject({ electricArcs: 'clicks' });
  });

  it('the shared schema agrees with the value list', () => {
    for (const v of ELECTRIC_ARC_MODES)
      expect(appearanceComfortSchema.safeParse({ electricArcs: v }).success).toBe(true);
    expect(appearanceComfortSchema.safeParse({ electricArcs: 'nope' }).success).toBe(false);
  });
});

describe('electricArcs resolution, store, seed and applier', () => {
  it('an absent or unknown value resolves to the default', () => {
    expect(resolveElectricArcs(null)).toBe('full');
    expect(resolveElectricArcs(undefined)).toBe('full');
    expect(resolveElectricArcs('wobble')).toBe('full');
    expect(resolveElectricArcs('clicks')).toBe('clicks');
    expect(isElectricArcs('clicks')).toBe(true);
    expect(isElectricArcs('nope')).toBe(false);
  });

  it('the store starts at the default and holds what is set', () => {
    const st = useThemeStore.getState();
    expect(st.electricArcs).toBe('full');
    st.setElectricArcs('clicks');
    expect(useThemeStore.getState().electricArcs).toBe('clicks');
    // An unknown value (e.g. from an older/newer client) resolves to the default.
    st.setElectricArcs('bogus' as never);
    expect(useThemeStore.getState().electricArcs).toBe('full');
  });

  it('the account seed writes non-defaults, clears the default, and skips null', () => {
    expect(accountAppearanceSeed({ electricArcs: 'clicks' })).toEqual({
      'rmh-electric-arcs': 'clicks',
    });
    expect(accountAppearanceSeed({ electricArcs: 'full' })).toEqual({ 'rmh-electric-arcs': null });
    expect(accountAppearanceSeed({ electricArcs: null })).not.toHaveProperty('rmh-electric-arcs');
    expect(accountAppearanceSeed({ electricArcs: 'bogus' })).not.toHaveProperty(
      'rmh-electric-arcs',
    );
  });

  it('the applier sets the attribute for non-defaults and removes it for the default', () => {
    const attrs = new Map<string, string>();
    const html = {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    } as unknown as HTMLElement;
    for (const v of ELECTRIC_ARC_MODES) {
      applyElectricArcs(html, v);
      if (v === DEFAULT_ELECTRIC_ARCS) expect(attrs.has('data-electric-arcs')).toBe(false);
      else expect(attrs.get('data-electric-arcs')).toBe(v);
    }
  });

  it('the pre-paint script stamps exactly the non-default values from the cache key', () => {
    const root = readFileSync(join(REPO, 'app/routes/__root.tsx'), 'utf8');
    const nonDefaults = ELECTRIC_ARC_MODES.filter((v) => v !== DEFAULT_ELECTRIC_ARCS);
    expect(root).toContain(`localStorage.getItem("rmh-electric-arcs")`);
    expect(root).toContain(`setAttribute("data-electric-arcs"`);
    const cond = nonDefaults.map((v) => `ea==="${v}"`).join('||');
    expect(root).toContain(
      `if(${cond}){document.documentElement.setAttribute("data-electric-arcs",ea)}`,
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
      v !== DEFAULT_ELECTRIC_ARCS
        ? ls.setItem(ELECTRIC_ARCS_KEY, v)
        : ls.removeItem(ELECTRIC_ARCS_KEY);
    for (const v of ELECTRIC_ARC_MODES) {
      write(v);
      expect(resolveElectricArcs(ls.getItem(ELECTRIC_ARCS_KEY))).toBe(v);
    }
    write(DEFAULT_ELECTRIC_ARCS);
    expect(ls.getItem(ELECTRIC_ARCS_KEY)).toBeNull();
  });
});

/**
 * The reader's fonts on the account (owner, 2026-11-23; lib/appearance/fonts.ts). Drives the real
 * `/api/preferences/appearance` handler (auth and Prisma mocked): font ids are validated per slot, stored as explicit
 * ids (defaults and `same` included), and GET returns them with the row's `updatedAt` for the turn-on merge.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const { getSession, upsert, findUnique } = vi.hoisted(() => ({
  getSession: vi.fn(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...a: unknown[]) => getSession(...a),
    },
  },
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    appearancePreference: {
      upsert,
      findUnique,
    },
  },
}));

import { route as Route } from '@/lib/preferences/api/preferences.appearance.server';
type Handler = (ctx: { params: object; request: Request }) => Promise<Response>;
const handlers = handlersOf<Handler>(Route);

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
      headers: {
        cookie: 'better-auth.session_token=abc',
      },
    }),
  });

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue({ user: { id: 'u1', name: 'Ada', isAdmin: false } });
  upsert.mockReset();
  upsert.mockImplementation(async ({ update }: { update: Record<string, unknown> }) => ({
    userId: 'u1',
    style: null,
    fontMain: update.fontMain ?? null,
    fontReading: update.fontReading ?? null,
    fontMono: update.fontMono ?? null,
    updatedAt: new Date('2026-11-23T10:00:00Z'),
  }));
  findUnique.mockReset();
});

describe('appearance API: fonts', () => {
  it('rejects a mono face for the main slot', async () => {
    const res = await put({ fontMain: 'dm-mono' });
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects an unknown id', async () => {
    expect((await put({ fontReading: 'comic-sans' })).status).toBe(400);
  });

  it('stores explicit ids, the default and same included', async () => {
    const res = await put({ fontMain: 'dm-sans', fontReading: 'same', fontMono: 'jetbrains-mono' });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update).toMatchObject({
      fontMain: 'dm-sans',
      fontReading: 'same',
      fontMono: 'jetbrains-mono',
    });
    const body = await res.json();
    expect(body).toMatchObject({ fontMain: 'dm-sans', fontReading: 'same', fontMono: 'jetbrains-mono' });
    expect(body.updatedAt).toBe('2026-11-23T10:00:00.000Z');
  });

  it('a field left out is unchanged', async () => {
    await put({ fontMono: 'geist-mono' });
    const update = upsert.mock.calls[0][0].update;
    expect(update.fontMono).toBe('geist-mono');
    expect('fontMain' in update).toBe(false);
  });

  it('GET with no row: fonts never chosen, no updatedAt', async () => {
    findUnique.mockResolvedValue(null);
    const body = await (await get()).json();
    expect(body).toMatchObject({ fontMain: null, fontReading: null, fontMono: null, updatedAt: null });
  });

  it('GET returns the stored fonts and updatedAt', async () => {
    findUnique.mockResolvedValue({
      userId: 'u1',
      fontMain: 'literata',
      fontReading: 'same',
      fontMono: null,
      readableFont: false,
      updatedAt: new Date('2026-11-22T08:00:00Z'),
    });
    const body = await (await get()).json();
    expect(body).toMatchObject({
      fontMain: 'literata',
      fontReading: 'same',
      fontMono: null,
      updatedAt: '2026-11-22T08:00:00.000Z',
    });
  });
});

/**
 * `GET /api/altair/coop-place` (s15-20): the caller's own place on a co-op board. Signed out it answers `null` and
 * reads nothing; signed in it asks `coopOwnPlace` for the caller alone (the hidden-member filter and the board's order
 * live there, `coop-own-place.test.ts`); a hidden member's `null` passes through; the answer is private and never
 * stored by a shared cache; a board kind that is not a co-op board is refused.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as null | { user: { id: string }; session: { id: string; userId: string } },
  ownPlace: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => h.session) } },
}));
vi.mock('@features/altair/engine/coop-record.server', () => ({ coopOwnPlace: h.ownPlace }));

const { route } = await import('@features/altair/api/altair.coop-place.server');

let ip = 0;
function get(query: string) {
  ip += 1;
  return route.handlers.GET!({
    request: new Request(`https://rmhstudios.com/api/altair/coop-place${query}`, {
      headers: { cookie: 'better-auth.session_token=t', 'x-forwarded-for': `203.0.113.${ip}` },
    }),
    params: {},
  });
}

const signIn = (id: string) => {
  h.session = { user: { id }, session: { id: `s-${id}`, userId: id } };
};

beforeEach(() => {
  h.session = null;
  h.ownPlace.mockReset();
});

describe('GET /api/altair/coop-place', () => {
  it('answers null signed out and reads no board', async () => {
    const res = await get('?type=coop-wins');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    expect(h.ownPlace).not.toHaveBeenCalled();
  });

  it('asks for the signed-in caller’s place on the board named, and returns it', async () => {
    signIn('u34');
    h.ownPlace.mockResolvedValue({ place: 34, value: 3, runs: 9 });
    const res = await get('?type=coop-revives');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ place: 34, value: 3, runs: 9 });
    expect(h.ownPlace).toHaveBeenCalledWith('u34', 'coop-revives');
  });

  it('passes a hidden member’s null through', async () => {
    signIn('hidden');
    h.ownPlace.mockResolvedValue(null);
    const res = await get('?type=coop-wins');
    expect(await res.json()).toBeNull();
  });

  it('is private and varies on the cookie, so no shared cache stores one member’s place for another', async () => {
    signIn('u34');
    h.ownPlace.mockResolvedValue({ place: 34, value: 3, runs: 9 });
    const res = await get('?type=coop-wins');
    const cache = res.headers.get('cache-control') ?? '';
    expect(cache).toMatch(/^private\b/);
    expect(cache).not.toMatch(/public|s-maxage/);
    expect(res.headers.get('vary') ?? '').toMatch(/\bCookie\b/);
  });

  it('refuses a board that is not a co-op board, and a missing type', async () => {
    signIn('u34');
    expect((await get('?type=score')).status).toBe(400);
    expect((await get('')).status).toBe(400);
    expect(h.ownPlace).not.toHaveBeenCalled();
  });
});

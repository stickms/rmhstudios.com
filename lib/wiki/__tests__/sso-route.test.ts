/**
 * GET /api/wiki/sso, end to end through the real `defineHandler`: only the
 * session and the database are stubbed. The pass it issues is read back and its
 * signature checked, so what is asserted is what the wiki would accept.
 */
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({ getSession: vi.fn(), findUnique: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => h.getSession(...a) } },
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: { user: { findUnique: h.findUnique } } }));

import { route } from '@/lib/wiki/api/wiki.sso.server';
import { wikiLoginKey } from '@/lib/wiki/sso.server';

const sso = handlersOf(route);
const STATE = '0123456789abcdef0123456789abcdef';
const SECRET = 'test-secret';
const MEMBER = {
  id: 'u1',
  handle: 'alex_doe',
  username: 'alex',
  isAdmin: false,
  bannedUntil: null as Date | null,
};

function get(query: string): Promise<Response> {
  return sso.GET!({
    request: new Request(`https://rmhstudios.com/api/wiki/sso?${query}`, {
      // A fresh address per request, so no test meets another's rate limit.
      headers: { 'cf-connecting-ip': `${Math.random()}`, cookie: 'better-auth.session_token=abc' },
    }),
    params: {},
  });
}

/** The pass in a redirect to the wiki, decoded after checking its signature. */
function passIn(location: string): Record<string, unknown> {
  const url = new URL(location);
  const pass = url.searchParams.get('pass')!;
  const [body, signature] = pass.split('.');
  const expected = createHmac('sha256', wikiLoginKey(SECRET)).update(body!).digest('base64url');
  expect(signature).toBe(expected);
  return JSON.parse(Buffer.from(body!, 'base64url').toString()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('BETTER_AUTH_SECRET', SECRET);
  vi.stubEnv('WIKI_PUBLIC_URL', 'https://wiki.rmhstudios.com');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.getSession.mockResolvedValue({ user: { id: 'u1', isAdmin: false } });
  h.findUnique.mockResolvedValue(MEMBER);
});

describe('GET /api/wiki/sso', () => {
  it('sends a signed-out visitor to the login page, which comes back here', async () => {
    h.getSession.mockResolvedValue(null);
    const res = await get(`state=${STATE}`);
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toBe(
      `/login?callbackURL=${encodeURIComponent(`/api/wiki/sso?state=${STATE}`)}`,
    );
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it("sends a member back to the wiki's sign-in page with a pass for their state", async () => {
    const res = await get(`state=${STATE}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const location = res.headers.get('location')!;
    expect(
      location.startsWith('https://wiki.rmhstudios.com/wiki/Special:RMHStudiosLogin?pass='),
    ).toBe(true);
    const claims = passIn(location);
    expect(claims).toMatchObject({ v: 1, sub: 'u1', name: 'alex_doe', admin: false, state: STATE });
    const now = Math.floor(Date.now() / 1000);
    expect(claims.exp).toBeGreaterThan(now);
    expect(claims.exp).toBeLessThanOrEqual(now + 120);
  });

  it('says whether the member is a site admin, from the database, not the session', async () => {
    h.findUnique.mockResolvedValue({ ...MEMBER, isAdmin: true });
    expect(passIn((await get(`state=${STATE}`)).headers.get('location')!).admin).toBe(true);
    // A stale session saying "admin" does not make a demoted member one.
    h.getSession.mockResolvedValue({ user: { id: 'u1', isAdmin: true } });
    h.findUnique.mockResolvedValue(MEMBER);
    expect(passIn((await get(`state=${STATE}`)).headers.get('location')!).admin).toBe(false);
  });

  it('falls back to the username when there is no handle, and says so when there is neither', async () => {
    h.findUnique.mockResolvedValue({ ...MEMBER, handle: null });
    expect(passIn((await get(`state=${STATE}`)).headers.get('location')!).name).toBe('alex');
    h.findUnique.mockResolvedValue({ ...MEMBER, handle: null, username: null });
    expect((await get(`state=${STATE}`)).headers.get('location')).toBe(
      'https://wiki.rmhstudios.com/wiki/Special:RMHStudiosLogin?error=noname',
    );
  });

  it('gives a suspended member no pass', async () => {
    h.findUnique.mockResolvedValue({ ...MEMBER, bannedUntil: new Date(Date.now() + 60_000) });
    expect((await get(`state=${STATE}`)).headers.get('location')).toBe(
      'https://wiki.rmhstudios.com/wiki/Special:RMHStudiosLogin?error=banned',
    );
    // An expired suspension is no suspension.
    h.findUnique.mockResolvedValue({ ...MEMBER, bannedUntil: new Date(Date.now() - 60_000) });
    expect((await get(`state=${STATE}`)).headers.get('location')).toContain('?pass=');
  });

  it.each(['', 'state=', 'state=abc', `state=${STATE.toUpperCase()}`, `state=${STATE}0`])(
    'refuses a malformed state (%j) before looking anyone up',
    async (query) => {
      expect((await get(query)).status).toBe(400);
      expect(h.findUnique).not.toHaveBeenCalled();
    },
  );

  it('issues nothing without the secret the wiki shares', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    expect((await get(`state=${STATE}`)).status).toBe(503);
  });
});

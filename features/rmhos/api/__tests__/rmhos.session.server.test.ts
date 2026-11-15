import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));
const findUnique = vi.fn();
vi.mock('@/lib/prisma.server', () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));
const getUserTier = vi.fn();
vi.mock('@/lib/entitlements', () => ({ getUserTier: (...a: unknown[]) => getUserTier(...a) }));

import { route } from '../rmhos.session.server';
import { TicketBook } from '../../../../server/rmhos-net/tickets';

const SECRET = 'test-secret-value-that-is-at-least-32-characters';
const ENV_KEYS = [
  'RMHOS_NET_ENABLED',
  'RMHOS_NET_TICKET_SECRET',
  'RMHOS_NET_ACCESS',
  'RMHOS_NET_MIN_ACCOUNT_AGE_DAYS',
  'VITE_RMHOS_NET_URL',
  'BETTER_AUTH_URL',
] as const;
const saved: Record<string, string | undefined> = {};

type Handler = (a: { request: Request; params: object }) => Promise<Response>;

let ip = 0;
async function call(
  user: Record<string, unknown> | null,
  url = 'https://rmhstudios.com/api/rmhos/session',
) {
  getSession.mockResolvedValue(user ? { user: { id: 'user-1', ...user } } : null);
  const handler = (route as unknown as { handlers: { GET: Handler } }).handlers.GET;
  const request = new Request(url, {
    headers: { cookie: 'better-auth.session_token=x', 'cf-connecting-ip': `10.4.0.${ip++ % 250}` },
  });
  return handler({ request, params: {} });
}

type Body = {
  linuxUser: string;
  net: { enabled: boolean; url?: string; ticket?: string; reason?: string };
};
const json = async (res: Response) => (await res.json()) as Body;

describe('GET /api/rmhos/session', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    findUnique.mockResolvedValue({
      bannedUntil: null,
      emailVerified: true,
      createdAt: new Date(Date.now() - 400 * 86_400_000),
    });
    getUserTier.mockResolvedValue('free');
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('maps the handle to a linux user', async () => {
    expect((await json(await call({ handle: 'Élan.Vital' }))).linuxUser).toBe('u_lan_vital');
  });
  it('falls back to rmh with no handle and no username', async () => {
    expect((await json(await call({}))).linuxUser).toBe('rmh');
  });
  it('uses the username when the handle is absent', async () => {
    expect((await json(await call({ username: 'Bob' }))).linuxUser).toBe('bob');
  });
  it('disables net when the secret is unset', async () => {
    expect((await json(await call({}))).net).toEqual({ enabled: false });
  });
  it('disables net when RMHOS_NET_ENABLED=0', async () => {
    process.env.RMHOS_NET_TICKET_SECRET = SECRET;
    process.env.RMHOS_NET_ENABLED = '0';
    expect((await json(await call({}))).net).toEqual({ enabled: false });
  });
  it('disables net when the secret is shorter than the hub accepts (32 characters)', async () => {
    process.env.RMHOS_NET_TICKET_SECRET = 'x'.repeat(31);
    expect((await json(await call({}))).net).toEqual({ enabled: false });
    process.env.RMHOS_NET_TICKET_SECRET = 'x'.repeat(32);
    expect((await json(await call({}))).net.enabled).toBe(true);
  });
  it("issues a ticket the hub's own ticket book accepts for this user", async () => {
    process.env.RMHOS_NET_TICKET_SECRET = SECRET;
    const { net } = await json(await call({}));
    expect(net.enabled).toBe(true);
    // The hub verifies through TicketBook (signature, then first use inside the 60 s window).
    expect(new TicketBook(SECRET).authorize(net.ticket as string)).toMatchObject({
      ok: true,
      userId: 'user-1',
    });
    expect(new TicketBook('another-secret-another-secret-another').authorize(net.ticket as string)).toEqual({
      ok: false,
    });
  });
  it('uses VITE_RMHOS_NET_URL when set', async () => {
    process.env.RMHOS_NET_TICKET_SECRET = SECRET;
    process.env.VITE_RMHOS_NET_URL = 'wss://relay.example/x/';
    expect((await json(await call({}))).net.url).toBe('wss://relay.example/x/');
  });
  it('derives wss from an https request', async () => {
    process.env.RMHOS_NET_TICKET_SECRET = SECRET;
    expect((await json(await call({}))).net.url).toBe('wss://rmhstudios.com/rmhos-net/');
  });
  it('derives ws from an http request', async () => {
    process.env.RMHOS_NET_TICKET_SECRET = SECRET;
    const res = await call({}, 'http://localhost:7005/api/rmhos/session');
    expect((await json(res)).net.url).toBe('ws://localhost:7005/rmhos-net/');
  });
  it('prefers BETTER_AUTH_URL (the public origin) over the request URL behind Apache', async () => {
    process.env.RMHOS_NET_TICKET_SECRET = SECRET;
    process.env.BETTER_AUTH_URL = 'https://rmhstudios.com';
    const res = await call({}, 'http://127.0.0.1:7005/api/rmhos/session');
    expect((await json(res)).net.url).toBe('wss://rmhstudios.com/rmhos-net/');
  });
  it('is no-store', async () => {
    expect((await call({})).headers.get('cache-control')).toBe('no-store');
  });
  it('rejects an unauthenticated caller', async () => {
    expect((await call(null)).status).toBe(401);
  });

  describe('who gets the network', () => {
    beforeEach(() => {
      process.env.RMHOS_NET_TICKET_SECRET = SECRET;
    });

    it('a suspended or banned account gets no ticket and no reason', async () => {
      findUnique.mockResolvedValue({
        bannedUntil: new Date(Date.now() + 86_400_000),
        emailVerified: true,
        createdAt: new Date(0),
      });
      expect((await json(await call({}))).net).toEqual({ enabled: false });
    });
    it('an expired ban no longer blocks', async () => {
      findUnique.mockResolvedValue({
        bannedUntil: new Date(Date.now() - 1000),
        emailVerified: true,
        createdAt: new Date(0),
      });
      expect((await json(await call({}))).net.enabled).toBe(true);
    });
    it('a deleted account gets nothing', async () => {
      findUnique.mockResolvedValue(null);
      expect((await json(await call({}))).net).toEqual({ enabled: false });
    });
    it('all (the default): a free, unverified account qualifies', async () => {
      findUnique.mockResolvedValue({ bannedUntil: null, emailVerified: false, createdAt: new Date() });
      expect((await json(await call({}))).net.enabled).toBe(true);
    });
    it('members: free accounts are not eligible, paid ones are', async () => {
      process.env.RMHOS_NET_ACCESS = 'members';
      expect((await json(await call({}))).net).toEqual({ enabled: false, reason: 'not-eligible' });
      getUserTier.mockResolvedValue('starter');
      expect((await json(await call({}))).net.enabled).toBe(true);
    });
    it('an unrecognised access value fails closed to members', async () => {
      process.env.RMHOS_NET_ACCESS = 'member-only';
      expect((await json(await call({}))).net).toEqual({ enabled: false, reason: 'not-eligible' });
    });
    it('verified: needs a verified email', async () => {
      process.env.RMHOS_NET_ACCESS = 'verified';
      findUnique.mockResolvedValue({ bannedUntil: null, emailVerified: null, createdAt: new Date(0) });
      expect((await json(await call({}))).net).toEqual({ enabled: false, reason: 'not-eligible' });
      findUnique.mockResolvedValue({ bannedUntil: null, emailVerified: true, createdAt: new Date(0) });
      expect((await json(await call({}))).net.enabled).toBe(true);
    });
    it('a minimum account age applies in every mode', async () => {
      process.env.RMHOS_NET_MIN_ACCOUNT_AGE_DAYS = '7';
      findUnique.mockResolvedValue({
        bannedUntil: null,
        emailVerified: true,
        createdAt: new Date(Date.now() - 3 * 86_400_000),
      });
      expect((await json(await call({}))).net).toEqual({ enabled: false, reason: 'not-eligible' });
      findUnique.mockResolvedValue({
        bannedUntil: null,
        emailVerified: true,
        createdAt: new Date(Date.now() - 8 * 86_400_000),
      });
      expect((await json(await call({}))).net.enabled).toBe(true);
    });
    it('does not look anyone up while networking is off', async () => {
      delete process.env.RMHOS_NET_TICKET_SECRET;
      findUnique.mockClear();
      await call({});
      expect(findUnique).not.toHaveBeenCalled();
    });
  });
});

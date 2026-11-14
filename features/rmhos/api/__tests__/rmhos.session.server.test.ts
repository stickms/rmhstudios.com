import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { route } from '../rmhos.session.server';
import { verifyNetTicket } from '../../engine/net-ticket.server';

const SECRET = 'test-secret-value';
const ENV_KEYS = [
  'RMHOS_NET_ENABLED',
  'RMHOS_NET_TICKET_SECRET',
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

type Body = { linuxUser: string; net: { enabled: boolean; url?: string; ticket?: string } };
const json = async (res: Response) => (await res.json()) as Body;

describe('GET /api/rmhos/session', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
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
  it('issues a ticket the relay accepts', async () => {
    process.env.RMHOS_NET_TICKET_SECRET = SECRET;
    const { net } = await json(await call({}));
    expect(net.enabled).toBe(true);
    expect(verifyNetTicket(net.ticket as string, SECRET)).toEqual({ ok: true, userId: 'user-1' });
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
  it('is no-store', async () => {
    expect((await call({})).headers.get('cache-control')).toBe('no-store');
  });
  it('rejects an unauthenticated caller', async () => {
    expect((await call(null)).status).toBe(401);
  });
});

/** The singular `join-request` route: ask (POST) and withdraw (DELETE). */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  communityWithRole: vi.fn(),
  requestToJoin: vi.fn(),
  cancelRequest: vi.fn(),
}));

vi.mock('@/lib/communities/guard.server', () => ({ communityWithRole: h.communityWithRole }));
vi.mock('@/lib/communities/join-requests.server', () => ({
  JOIN_REQUEST_MESSAGE_MAX: 280,
  requestToJoin: h.requestToJoin,
  cancelRequest: h.cancelRequest,
}));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: (c: unknown) => unknown) => fn,
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
const handlers = async () =>
  (
    (await import('@/app/routes/api/communities/$slug/join-request')) as unknown as {
      Route: { options: { server: { handlers: Record<string, Handler> } } };
    }
  ).Route.options.server.handlers;

const ctx = (body?: unknown) => ({
  params: { slug: 's' },
  session: { user: { id: 'u1', name: 'U' } },
  body,
});
const PRIVATE = { id: 'c1', slug: 's', name: 'N', isPrivate: true, role: null };

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.communityWithRole.mockResolvedValue(PRIVATE);
});

describe('POST /join-request', () => {
  it('files a request with the trimmed message and answers PENDING', async () => {
    h.requestToJoin.mockResolvedValue({ ok: true, status: 'PENDING' });
    const res = await (await handlers()).POST(ctx({ message: 'let me in' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: 'PENDING' });
    expect(h.requestToJoin).toHaveBeenCalledWith(PRIVATE, 'u1', 'U', 'let me in');
  });

  it('a missing body is an empty message', async () => {
    h.requestToJoin.mockResolvedValue({ ok: true, status: 'PENDING' });
    await (await handlers()).POST(ctx(undefined));
    expect(h.requestToJoin).toHaveBeenCalledWith(PRIVATE, 'u1', 'U', null);
  });

  it('404 for a missing community; 400 for an open one (just join it)', async () => {
    h.communityWithRole.mockResolvedValue(null);
    expect((await (await handlers()).POST(ctx())).status).toBe(404);
    h.communityWithRole.mockResolvedValue({ ...PRIVATE, isPrivate: false });
    expect((await (await handlers()).POST(ctx())).status).toBe(400);
    expect(h.requestToJoin).not.toHaveBeenCalled();
  });

  it('409 for an existing member; 429 with retryAt during the cooldown', async () => {
    h.requestToJoin.mockResolvedValue({ ok: false, reason: 'member' });
    expect((await (await handlers()).POST(ctx())).status).toBe(409);
    h.requestToJoin.mockResolvedValue({
      ok: false,
      reason: 'cooldown',
      retryAt: '2030-01-01T00:00:00.000Z',
    });
    const res = await (await handlers()).POST(ctx());
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ retryAt: '2030-01-01T00:00:00.000Z' });
  });
});

describe('DELETE /join-request', () => {
  it("withdraws the caller's own request", async () => {
    const res = await (await handlers()).DELETE(ctx());
    expect(res.status).toBe(200);
    expect(h.cancelRequest).toHaveBeenCalledWith('c1', 'u1');
  });

  it('404 for a missing community, nothing cancelled', async () => {
    h.communityWithRole.mockResolvedValue(null);
    expect((await (await handlers()).DELETE(ctx())).status).toBe(404);
    expect(h.cancelRequest).not.toHaveBeenCalled();
  });
});

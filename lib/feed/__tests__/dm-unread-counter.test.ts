/**
 * Marking DMs read must also drop the Redis unread counter the badge reads
 * (`dm:unread:<uid>`, 60s TTL). Both read endpoints used to update Postgres and
 * notify the stream, which then re-read the stale counter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  del: vi.fn(async (..._k: string[]) => {}),
  updateMany: vi.fn(async (_a: unknown) => ({ count: 3 })),
  conversationFindMany: vi.fn(async () => [{ id: 'c1' }]),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'me' }, session: {} }) } },
}));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/redis.server', () => ({ redisDel: h.del }));
vi.mock('@/lib/message-events', () => ({ notifyUser: vi.fn() }));
vi.mock('@/lib/chat-plus/receipts.server', () => ({
  getPairPrivacy: async () => ({ receiptsHidden: true }),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    conversation: {
      findUnique: async () => ({ participantOneId: 'me', participantTwoId: 'other' }),
      findMany: h.conversationFindMany,
    },
    directMessage: { updateMany: h.updateMany },
  },
}));

import { Route as ReadAll } from '../../../app/routes/api/messages/read-all';
import { Route as ReadOne } from '../../../app/routes/api/messages/$conversationId/read';

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const post = (route: unknown, params: Record<string, string> = {}) =>
  (route as { options: { server: { handlers: { POST: Handler } } } }).options.server.handlers.POST({
    request: new Request('https://x.test/x', {
      method: 'POST',
      headers: { 'cf-connecting-ip': String(Math.random()), cookie: 'better-auth.session_token=t' },
    }),
    params,
  });

beforeEach(() => {
  h.del.mockClear();
  h.updateMany.mockClear();
  h.conversationFindMany.mockClear();
  h.updateMany.mockResolvedValue({ count: 3 });
});

describe('DM unread counter', () => {
  it('read-all drops the counter and uses one statement', async () => {
    expect((await post(ReadAll)).status).toBe(200);
    expect(h.del).toHaveBeenCalledWith('dm:unread:me');
    expect(h.updateMany).toHaveBeenCalledTimes(1);
    expect(h.conversationFindMany).not.toHaveBeenCalled();
  });

  it('marking one conversation read drops the counter', async () => {
    expect((await post(ReadOne, { conversationId: 'c1' })).status).toBe(200);
    expect(h.del).toHaveBeenCalledWith('dm:unread:me');
  });

  it('leaves the counter alone when nothing was unread', async () => {
    h.updateMany.mockResolvedValue({ count: 0 });
    await post(ReadAll);
    await post(ReadOne, { conversationId: 'c1' });
    expect(h.del).not.toHaveBeenCalled();
  });
});

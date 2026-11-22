/**
 * `PATCH /api/v1/webhooks/{id}` with `enabled: true` on an endpoint an admin switched off (S10-15) answers 409
 * `conflict` and changes nothing; an endpoint that is only owner-disabled can still be re-enabled.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  adminDisabledAt: null as Date | null,
  updateManyWhere: null as Record<string, unknown> | null,
  updateCalls: 0,
}));

vi.mock('@/lib/api/developer-auth.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/developer-auth.server')>()),
  authenticateApiKey: async () => ({
    ok: true,
    userId: 'owner_1',
    tier: 'starter',
    keyId: 'key_1',
    scopes: ['manage:webhooks'],
    testMode: false,
    allowedCidrs: [],
    rateLimitPerMinute: null,
  }),
  touchApiKeyLastUsed: () => undefined,
}));
vi.mock('@/lib/redis.server', () => ({ redisRateLimit: async () => null, redisIncrBy: async () => null }));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (config: unknown) => ({ options: config }) }));

const endpoint = () => ({
  id: 'wh_1',
  url: 'https://example.com/hook',
  events: ['*'],
  description: null,
  enabled: false,
  failureCount: 3,
  lastDeliveryAt: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    webhookEndpoint: {
      findUnique: async () => ({ userId: 'owner_1' }),
      // The condition `adminDisabledAt: null` is part of the write, as the route promises.
      updateMany: async ({ where }: { where: Record<string, unknown> }) => {
        h.updateManyWhere = where;
        if (where.adminDisabledAt === null && h.adminDisabledAt !== null) return { count: 0 };
        h.updateCalls++;
        return { count: 1 };
      },
      update: async () => ({ ...endpoint(), enabled: true }),
    },
  },
}));

const route = handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/webhooks/$id')).Route);
const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;
const patch = (body: unknown) =>
  route!.PATCH!({
    request: new Request('https://x.test/api/v1/webhooks/wh_1', {
      method: 'PATCH',
      headers: { authorization: BEARER, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: { id: 'wh_1' },
  });

beforeEach(() => {
  h.adminDisabledAt = null;
  h.updateManyWhere = null;
  h.updateCalls = 0;
});

describe('PATCH /api/v1/webhooks/{id} enabled: true', () => {
  it('answers 409 conflict for an admin-disabled endpoint and writes nothing', async () => {
    h.adminDisabledAt = new Date('2026-11-20T00:00:00Z');
    const res = await patch({ enabled: true });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('conflict');
    expect(h.updateCalls).toBe(0);
  });

  it('re-enables an endpoint that no admin switched off', async () => {
    const res = await patch({ enabled: true });
    expect(res.status).toBe(200);
    expect(h.updateManyWhere).toMatchObject({ id: 'wh_1', userId: 'owner_1', adminDisabledAt: null });
    expect(h.updateCalls).toBe(1);
  });
});

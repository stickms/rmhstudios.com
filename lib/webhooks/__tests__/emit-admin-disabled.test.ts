/**
 * s10-15: delivery skips an endpoint an admin switched off. A fresh event is not fanned out to it, a test ping or a
 * redelivery does not reach it, and the retry drain fails what was already queued for it without sending.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  endpoints: [] as Record<string, unknown>[],
  due: [] as Record<string, unknown>[],
  safeFetch: vi.fn(),
  deliveryCreate: vi.fn(),
  deliveryUpdateMany: vi.fn(),
  endpointFindMany: vi.fn(),
}));

vi.mock('@/lib/ssrf-guard.server', () => ({
  safeFetch: mocks.safeFetch,
  SsrfError: class SsrfError extends Error {},
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    webhookEndpoint: {
      findUnique: vi.fn(
        async (a: { where: { id: string } }) => mocks.endpoints.find((e) => e.id === a.where.id) ?? null,
      ),
      findMany: mocks.endpointFindMany,
      update: vi.fn(async () => ({})),
    },
    webhookDelivery: {
      create: mocks.deliveryCreate,
      updateMany: mocks.deliveryUpdateMany,
      findMany: vi.fn(async () => mocks.due),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

import { deliverDuePending, deliverToEndpoint, emitWebhookEvent } from '@/lib/webhooks/emit.server';

const SECRET = ['test', 'secret', 'one'].join('-');
const base = { id: 'ep1', url: 'https://example.com/hook', secret: SECRET, failureCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.endpoints = [];
  mocks.due = [];
  mocks.deliveryCreate.mockResolvedValue({ id: 'd1' });
  mocks.deliveryUpdateMany.mockResolvedValue({ count: 1 });
  mocks.safeFetch.mockResolvedValue({ status: 200 });
  mocks.endpointFindMany.mockResolvedValue([]);
});

describe('an admin-disabled endpoint', () => {
  it('is left out of the fan-out by the query itself, so nothing is recorded or sent', async () => {
    await emitWebhookEvent('u1', 'ping', {});
    const where = mocks.endpointFindMany.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({ userId: 'u1', enabled: true, adminDisabledAt: null });
    expect(mocks.deliveryCreate).not.toHaveBeenCalled();
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it('gets no test ping or redelivery, even though those ignore the enabled flag', async () => {
    mocks.endpoints = [{ ...base, adminDisabledAt: new Date('2026-12-01T00:00:00Z') }];
    expect(await deliverToEndpoint('ep1', 'ping', { event: 'ping' })).toBeNull();
    expect(mocks.deliveryCreate).not.toHaveBeenCalled();
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it('still receives a test ping when no admin disabled it', async () => {
    mocks.endpoints = [{ ...base, adminDisabledAt: null }];
    expect(await deliverToEndpoint('ep1', 'ping', { event: 'ping' })).toEqual({ id: 'd1' });
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it('has its already-queued deliveries failed by the drain, not sent, even if `enabled` was written back to true', async () => {
    mocks.due = [
      {
        id: 'd1',
        event: 'ping',
        payload: {},
        attempts: 0,
        endpoint: { ...base, enabled: true, adminDisabledAt: new Date('2026-12-01T00:00:00Z') },
      },
      {
        id: 'd2',
        event: 'ping',
        payload: {},
        attempts: 0,
        endpoint: { ...base, id: 'ep2', enabled: true, adminDisabledAt: null },
      },
    ];
    const attempted = await deliverDuePending();
    expect(attempted).toBe(1);
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['d1'] }, status: 'PENDING' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  endpoint: null as Record<string, unknown> | null,
  safeFetch: vi.fn(),
  deliveryCreate: vi.fn(),
  deliveryUpdateMany: vi.fn(),
  endpointUpdate: vi.fn(),
}));

vi.mock('@/lib/ssrf-guard.server', () => ({
  safeFetch: mocks.safeFetch,
  SsrfError: class SsrfError extends Error {},
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    webhookEndpoint: {
      findUnique: vi.fn(async () => mocks.endpoint),
      update: mocks.endpointUpdate,
    },
    webhookDelivery: { create: mocks.deliveryCreate, updateMany: mocks.deliveryUpdateMany },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

import { deliverToEndpoint } from '@/lib/webhooks/emit.server';
import { signWebhookPayload, verifyWebhookSignature } from '@/lib/webhooks/signature';

const base = { id: 'ep1', url: 'https://example.com/hook', secret: 'whsec_new', failureCount: 0 };

function sentHeaders(): Record<string, string> {
  return mocks.safeFetch.mock.calls[0]?.[1].headers;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deliveryCreate.mockResolvedValue({ id: 'd1' });
  mocks.deliveryUpdateMany.mockResolvedValue({ count: 1 });
  mocks.endpointUpdate.mockResolvedValue({});
  mocks.safeFetch.mockResolvedValue({ status: 200 });
});

describe('deliverToEndpoint', () => {
  it('signs with both secrets while the rotation overlap is open, and either verifies', async () => {
    mocks.endpoint = {
      ...base,
      previousSecret: 'whsec_old',
      previousSecretExpiresAt: new Date(Date.now() + 60_000),
    };
    await deliverToEndpoint('ep1', 'ping', { event: 'ping' });
    const headers = sentHeaders();
    expect(headers['X-RMH-Signature'].match(/v1=/g)).toHaveLength(2);
    const body = mocks.safeFetch.mock.calls[0]?.[1].body;
    expect(verifyWebhookSignature('whsec_new', headers['X-RMH-Signature'], body)).toBe(true);
    expect(verifyWebhookSignature('whsec_old', headers['X-RMH-Signature'], body)).toBe(true);
  });

  it('signs with the new secret alone once the overlap has ended', async () => {
    mocks.endpoint = {
      ...base,
      previousSecret: 'whsec_old',
      previousSecretExpiresAt: new Date(Date.now() - 1),
    };
    await deliverToEndpoint('ep1', 'ping', { event: 'ping' });
    const headers = sentHeaders();
    const body = mocks.safeFetch.mock.calls[0]?.[1].body;
    expect(headers['X-RMH-Signature'].match(/v1=/g)).toHaveLength(1);
    expect(verifyWebhookSignature('whsec_new', headers['X-RMH-Signature'], body)).toBe(true);
    expect(verifyWebhookSignature('whsec_old', headers['X-RMH-Signature'], body)).toBe(false);
    expect(headers['X-RMH-Signature']).toContain(signWebhookPayload('whsec_new', Number(headers['X-RMH-Timestamp']), body));
  });

  it('records the duration, marks a redelivery, and sends the new delivery id in the payload', async () => {
    mocks.endpoint = { ...base, previousSecret: null, previousSecretExpiresAt: null };
    const sent = await deliverToEndpoint('ep1', 'post.created', { event: 'post.created' }, { redeliveryOfId: 'orig' });
    expect(sent).toEqual({ id: 'd1' });
    expect(mocks.deliveryCreate.mock.calls[0]?.[0].data).toMatchObject({ endpointId: 'ep1', redeliveryOfId: 'orig' });
    expect(JSON.parse(mocks.safeFetch.mock.calls[0]?.[1].body)).toMatchObject({ id: 'd1', event: 'post.created' });
    const delivered = mocks.deliveryUpdateMany.mock.calls.find((c) => c[0].data.status === 'DELIVERED');
    expect(delivered?.[0].data.durationMs).toEqual(expect.any(Number));
  });

  it('records the duration of a failed attempt too', async () => {
    mocks.endpoint = { ...base, previousSecret: null, previousSecretExpiresAt: null };
    mocks.safeFetch.mockResolvedValue({ status: 500 });
    await deliverToEndpoint('ep1', 'ping', { event: 'ping' });
    const failed = mocks.deliveryUpdateMany.mock.calls.find((c) => c[0].data.error === 'HTTP 500');
    expect(failed?.[0].data).toMatchObject({ responseStatus: 500, durationMs: expect.any(Number) });
  });

  it('returns null for an endpoint that does not exist, without creating a delivery', async () => {
    mocks.endpoint = null;
    expect(await deliverToEndpoint('gone', 'ping', {})).toBeNull();
    expect(mocks.deliveryCreate).not.toHaveBeenCalled();
  });
});

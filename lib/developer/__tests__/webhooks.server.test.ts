import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Endpoint {
  id: string;
  userId: string;
  url: string;
  secret: string;
  previousSecret: string | null;
  previousSecretExpiresAt: Date | null;
  events: string[];
  description: string | null;
  enabled: boolean;
  failureCount: number;
  lastDeliveryAt: Date | null;
  createdAt: Date;
}
interface Delivery {
  id: string;
  endpointId: string;
  event: string;
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  attempts: number;
  responseStatus: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  redeliveryOfId: string | null;
  payload: unknown;
}

const db = vi.hoisted(() => ({
  endpoints: [] as Endpoint[],
  deliveries: [] as Delivery[],
  rawRows: [] as { endpointId: string; status: string; n: bigint }[],
  deliverToEndpoint: vi.fn(),
}));

/** Picks the selected keys, the way Prisma does: a secret never leaves unless it was selected. */
function pick<T extends object>(row: T, select: Record<string, boolean> | undefined): Partial<T> {
  if (!select) return { ...row };
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, on]) => on)
      .map(([k]) => [k, row[k as keyof T]]),
  ) as Partial<T>;
}
function matchesEndpoint(e: Endpoint, where: Partial<Endpoint> & { OR?: unknown }): boolean {
  return (['id', 'userId', 'secret'] as const).every((k) => where[k] === undefined || e[k] === where[k]);
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    $queryRaw: vi.fn(async () => db.rawRows),
    webhookEndpoint: {
      findMany: vi.fn(async ({ where, select }) =>
        db.endpoints.filter((e) => matchesEndpoint(e, where)).map((e) => pick(e, select)),
      ),
      findFirst: vi.fn(async ({ where, select }) => {
        const e = db.endpoints.find((x) => matchesEndpoint(x, where));
        return e ? pick(e, select) : null;
      }),
      count: vi.fn(async ({ where }) => db.endpoints.filter((e) => matchesEndpoint(e, where)).length),
      create: vi.fn(async ({ data, select }) => {
        const e: Endpoint = {
          id: `ep${db.endpoints.length + 1}`,
          previousSecret: null,
          previousSecretExpiresAt: null,
          description: null,
          enabled: true,
          failureCount: 0,
          lastDeliveryAt: null,
          createdAt: new Date(),
          ...data,
        };
        db.endpoints.push(e);
        return pick(e, select);
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const hit = db.endpoints.filter((e) => matchesEndpoint(e, where));
        for (const e of hit) Object.assign(e, data);
        return { count: hit.length };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const hit = db.endpoints.filter((e) => matchesEndpoint(e, where));
        db.endpoints = db.endpoints.filter((e) => !hit.includes(e));
        return { count: hit.length };
      }),
    },
    webhookDelivery: {
      findMany: vi.fn(async ({ where, take, select }) => {
        let rows = db.deliveries.filter((d) => {
          if (where.endpointId?.in) return where.endpointId.in.includes(d.endpointId);
          return d.endpointId === where.endpointId;
        });
        if (where.status) rows = rows.filter((d) => d.status === where.status);
        if (where.event) rows = rows.filter((d) => d.event === where.event);
        if (where.error) rows = rows.filter((d) => d.error !== null);
        if (where.OR) {
          const [{ createdAt: before }, { createdAt: same, id }] = where.OR as [
            { createdAt: { lt: Date } },
            { createdAt: Date; id: { lt: string } },
          ];
          rows = rows.filter(
            (d) => d.createdAt < before.lt || (d.createdAt.getTime() === same.getTime() && d.id < id.lt),
          );
        }
        rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
        return rows.slice(0, take ?? rows.length).map((d) => pick(d, select));
      }),
      findFirst: vi.fn(async ({ where, select }) => {
        const d = db.deliveries.find((x) => {
          const owner = db.endpoints.find((e) => e.id === x.endpointId);
          return x.id === where.id && owner?.userId === where.endpoint.userId;
        });
        return d ? pick(d, select) : null;
      }),
    },
  },
}));

vi.mock('@/lib/webhooks/emit.server', async () => {
  const sig = await import('@/lib/webhooks/signature');
  return {
    generateWebhookSecret: sig.generateWebhookSecret,
    validateWebhookUrl: sig.validateWebhookUrl,
    deliverToEndpoint: db.deliverToEndpoint,
  };
});

import {
  createWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
  redeliver,
  rotateWebhookSecret,
  sendTestEvent,
  updateWebhook,
} from '@/lib/developer/webhooks.server';
import { MAX_WEBHOOK_ENDPOINTS, SECRET_OVERLAP_MS } from '@/lib/webhooks/limits';

const SECRET = 'whsec_current_value';
const OLD_SECRET = 'whsec_previous_value';

function endpoint(over: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'ep1',
    userId: 'alice',
    url: 'https://example.com/hook',
    secret: SECRET,
    previousSecret: OLD_SECRET,
    previousSecretExpiresAt: new Date(Date.now() + 3_600_000),
    events: ['post.created'],
    description: null,
    enabled: true,
    failureCount: 0,
    lastDeliveryAt: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    ...over,
  };
}
function delivery(over: Partial<Delivery> = {}): Delivery {
  return {
    id: 'd1',
    endpointId: 'ep1',
    event: 'post.created',
    status: 'DELIVERED',
    attempts: 1,
    responseStatus: 200,
    durationMs: 42,
    error: null,
    createdAt: new Date('2026-11-02T00:00:00Z'),
    deliveredAt: new Date('2026-11-02T00:00:01Z'),
    redeliveryOfId: null,
    payload: { event: 'post.created', data: { id: 'p1' } },
    ...over,
  };
}
const leaks = (value: unknown) => {
  const text = JSON.stringify(value);
  return text.includes(SECRET) || text.includes(OLD_SECRET) || /"(previousS|s)ecret"/.test(text);
};

beforeEach(() => {
  db.endpoints = [];
  db.deliveries = [];
  db.rawRows = [];
  db.deliverToEndpoint.mockReset();
});

describe('ownership', () => {
  beforeEach(() => {
    db.endpoints = [endpoint()];
    db.deliveries = [delivery()];
  });

  it("answers 404 for another member's endpoint on every operation, never 403", async () => {
    const results = await Promise.all([
      getWebhook('mallory', 'ep1', {}),
      updateWebhook('mallory', 'ep1', { enabled: false }),
      deleteWebhook('mallory', 'ep1'),
      rotateWebhookSecret('mallory', 'ep1'),
      sendTestEvent('mallory', 'ep1'),
      redeliver('mallory', 'd1'),
      getWebhook('mallory', 'does-not-exist', {}),
    ]);
    for (const r of results) expect(r).toMatchObject({ ok: false, status: 404 });
    expect(db.deliverToEndpoint).not.toHaveBeenCalled();
    // Nothing of Alice's was touched.
    expect(db.endpoints).toHaveLength(1);
    expect(db.endpoints[0]).toMatchObject({ enabled: true, secret: SECRET, previousSecret: OLD_SECRET });
  });

  it("lists only the caller's endpoints", async () => {
    db.endpoints.push(endpoint({ id: 'ep2', userId: 'bob' }));
    const { endpoints } = await listWebhooks('alice');
    expect(endpoints.map((e) => e.id)).toEqual(['ep1']);
  });
});

describe('secrets are never read back', () => {
  beforeEach(() => {
    db.endpoints = [endpoint()];
    db.deliveries = [delivery()];
  });

  it('keeps secret and previousSecret out of the list and the detail', async () => {
    expect(leaks(await listWebhooks('alice'))).toBe(false);
    const detail = await getWebhook('alice', 'ep1', {});
    expect(detail.ok).toBe(true);
    expect(leaks(detail)).toBe(false);
  });

  it('keeps them out of update, test and redeliver responses', async () => {
    db.deliverToEndpoint.mockResolvedValue({ id: 'd2' });
    db.deliveries.push(delivery({ id: 'd2', event: 'ping' }));
    expect(leaks(await updateWebhook('alice', 'ep1', { description: 'hooks' }))).toBe(false);
    expect(leaks(await sendTestEvent('alice', 'ep1'))).toBe(false);
    expect(leaks(await redeliver('alice', 'd1'))).toBe(false);
  });

  it('returns the secret once, in the create response, and never in a later read', async () => {
    db.endpoints = [];
    const created = await createWebhook('alice', {
      url: 'https://example.com/new',
      events: ['*'],
    });
    if (!created.ok) throw new Error('create failed');
    expect(created.secret).toMatch(/^whsec_/);
    expect(JSON.stringify(created.endpoint)).not.toContain(created.secret);
    expect(JSON.stringify(await listWebhooks('alice'))).not.toContain(created.secret);
  });
});

describe('rotation', () => {
  it('moves the secret into previousSecret with a 24 hour expiry and returns the new one once', async () => {
    db.endpoints = [endpoint({ previousSecret: null, previousSecretExpiresAt: null })];
    const before = Date.now();
    const rotated = await rotateWebhookSecret('alice', 'ep1');
    if (!rotated.ok) throw new Error('rotate failed');

    const stored = db.endpoints[0] as Endpoint;
    expect(stored.previousSecret).toBe(SECRET);
    expect(stored.secret).toBe(rotated.secret);
    expect(rotated.secret).not.toBe(SECRET);
    const expiresAt = (stored.previousSecretExpiresAt as Date).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(SECRET_OVERLAP_MS);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(SECRET_OVERLAP_MS);
    // The row the console shows says when the old secret stops working, and carries no secret.
    expect(rotated.endpoint.previousSecretExpiresAt).toBe(new Date(expiresAt).toISOString());
    expect(JSON.stringify(rotated.endpoint)).not.toContain(SECRET);
  });

  it('answers 409 when the secret changed under it', async () => {
    db.endpoints = [endpoint()];
    const { prisma } = await import('@/lib/prisma.server');
    vi.mocked(prisma.webhookEndpoint.updateMany).mockResolvedValueOnce({ count: 0 });
    expect(await rotateWebhookSecret('alice', 'ep1')).toMatchObject({ ok: false, status: 409 });
  });

  it('hides an overlap that has already closed', async () => {
    db.endpoints = [endpoint({ previousSecretExpiresAt: new Date(Date.now() - 1000) })];
    const { endpoints } = await listWebhooks('alice');
    expect(endpoints[0]?.previousSecretExpiresAt).toBeNull();
  });
});

describe('redelivery', () => {
  beforeEach(() => {
    db.endpoints = [endpoint()];
  });

  it('sends the original payload again as a new row pointing at the original', async () => {
    db.deliveries = [delivery({ id: 'd1', status: 'FAILED', error: 'HTTP 500' })];
    db.deliverToEndpoint.mockImplementation(async (_ep, event, _payload, opts) => {
      db.deliveries.push(delivery({ id: 'd2', event, redeliveryOfId: opts.redeliveryOfId }));
      return { id: 'd2' };
    });
    const sent = await redeliver('alice', 'd1');
    if (!sent.ok) throw new Error('redeliver failed');

    expect(db.deliverToEndpoint).toHaveBeenCalledWith(
      'ep1',
      'post.created',
      { event: 'post.created', data: { id: 'p1' } },
      { redeliveryOfId: 'd1' },
    );
    expect(sent.delivery).toMatchObject({ id: 'd2', redeliveryOfId: 'd1' });
    // The original row is untouched.
    expect(db.deliveries.find((d) => d.id === 'd1')).toMatchObject({
      status: 'FAILED',
      error: 'HTTP 500',
      attempts: 1,
    });
  });

  it('refuses a delivery that is still being retried', async () => {
    db.deliveries = [delivery({ status: 'PENDING' })];
    expect(await redeliver('alice', 'd1')).toMatchObject({ ok: false, status: 409 });
    expect(db.deliverToEndpoint).not.toHaveBeenCalled();
  });

  it('sends a test ping to this endpoint whatever it subscribes to', async () => {
    db.deliveries = [delivery({ id: 'd9', event: 'ping' })];
    db.deliverToEndpoint.mockResolvedValue({ id: 'd9' });
    const sent = await sendTestEvent('alice', 'ep1');
    expect(sent).toMatchObject({ ok: true, delivery: { id: 'd9', event: 'ping' } });
    expect(db.deliverToEndpoint.mock.calls[0]?.slice(0, 2)).toEqual(['ep1', 'ping']);
  });
});

describe('the endpoint cap', () => {
  it('allows the tenth endpoint and refuses the eleventh', async () => {
    db.endpoints = Array.from({ length: MAX_WEBHOOK_ENDPOINTS - 1 }, (_, i) => endpoint({ id: `e${i}` }));
    const body = { url: 'https://example.com/x', events: ['post.created'] };
    expect((await createWebhook('alice', body)).ok).toBe(true);
    const eleventh = await createWebhook('alice', body);
    expect(eleventh).toMatchObject({ ok: false, status: 400 });
    expect(db.endpoints.filter((e) => e.userId === 'alice')).toHaveLength(MAX_WEBHOOK_ENDPOINTS);
  });

  it("counts only the caller's endpoints", async () => {
    db.endpoints = Array.from({ length: MAX_WEBHOOK_ENDPOINTS }, (_, i) => endpoint({ id: `e${i}`, userId: 'bob' }));
    expect((await createWebhook('alice', { url: 'https://example.com/x', events: ['*'] })).ok).toBe(true);
  });
});

describe('create and update validation', () => {
  it('rejects a private address and an empty or unknown event list', async () => {
    expect(await createWebhook('alice', { url: 'https://localhost/x', events: ['*'] })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await createWebhook('alice', { url: 'http://example.com/x', events: ['*'] })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await createWebhook('alice', { url: 'https://example.com/x', events: ['nope'] })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(db.endpoints).toHaveLength(0);
  });

  it('re-enabling resets the failure count; disabling leaves it', async () => {
    db.endpoints = [endpoint({ enabled: false, failureCount: 20 })];
    await updateWebhook('alice', 'ep1', { enabled: false });
    expect(db.endpoints[0]?.failureCount).toBe(20);
    await updateWebhook('alice', 'ep1', { enabled: true });
    expect(db.endpoints[0]).toMatchObject({ enabled: true, failureCount: 0 });
  });
});

describe('the list', () => {
  it('derives health from the grouped counts and explains a disabled endpoint with its last error', async () => {
    db.endpoints = [endpoint({ id: 'ok' }), endpoint({ id: 'off', enabled: false, failureCount: 20 })];
    db.deliveries = [delivery({ id: 'a', endpointId: 'off', status: 'FAILED', error: 'connect ETIMEDOUT' })];
    db.rawRows = [
      { endpointId: 'ok', status: 'DELIVERED', n: 20n },
      { endpointId: 'off', status: 'FAILED', n: 20n },
    ];
    const { endpoints, max } = await listWebhooks('alice');
    const byId = Object.fromEntries(endpoints.map((e) => [e.id, e]));
    expect(max).toBe(MAX_WEBHOOK_ENDPOINTS);
    expect(byId.ok).toMatchObject({ health: 'healthy', disabledReason: null });
    expect(byId.off).toMatchObject({ health: 'failing', disabledReason: 'connect ETIMEDOUT' });
  });
});

describe('delivery pages', () => {
  it('pages newest first with a keyset cursor and applies the status and event filters', async () => {
    db.endpoints = [endpoint()];
    db.deliveries = Array.from({ length: 30 }, (_, i) =>
      delivery({
        id: `d${String(i).padStart(2, '0')}`,
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, i)),
        status: i % 2 === 0 ? 'FAILED' : 'DELIVERED',
        event: i % 3 === 0 ? 'ping' : 'post.created',
      }),
    );
    const first = await getWebhook('alice', 'ep1', {});
    if (!first.ok) throw new Error('read failed');
    expect(first.deliveries).toHaveLength(25);
    expect(first.deliveries[0]?.id).toBe('d29');
    expect(first.nextCursor).not.toBeNull();

    const second = await getWebhook('alice', 'ep1', { cursor: first.nextCursor as string });
    if (!second.ok) throw new Error('read failed');
    expect(second.deliveries.map((d) => d.id)).toEqual(['d04', 'd03', 'd02', 'd01', 'd00']);
    expect(second.nextCursor).toBeNull();

    const failed = await getWebhook('alice', 'ep1', { status: 'failed', event: 'ping' });
    if (!failed.ok) throw new Error('read failed');
    expect(failed.deliveries.every((d) => d.status === 'FAILED' && d.event === 'ping')).toBe(true);
    expect(failed.deliveries.length).toBeGreaterThan(0);
  });
});

/**
 * s10-15 webhook oversight, through the real endpoint wrapper with Prisma stood in for by a small in-memory fake:
 * admins only; no row ever carries a secret, a payload, a signature or a URL beyond its host and first path segment
 * (including an error text that echoes the URL); a disable is audited in its own transaction, cancels pending
 * deliveries and tells the owner through a `notice()` key; the owner's enable is refused with the reason while it
 * stands; a lift leaves `enabled` false; secure-account and the deletion hold never clear it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matches, type Row } from '@/lib/account/__tests__/deletion-hold-fake-db';

// Built from parts so no fixture is shaped like a real signing secret.
const SECRET = ['test', 'secret', 'one'].join('-');
const OLD_SECRET = ['test', 'secret', 'old'].join('-');
const PATH_TOKEN = 'T0KEN-in-the-path';
const QUERY_KEY = 'apikey-in-the-query';
const FULL_URL = `https://hooks.example.com/services/${PATH_TOKEN}/more?key=${QUERY_KEY}`;
const NOW = new Date('2026-12-01T12:00:00Z');

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  endpoints: [] as Row[],
  deliveries: [] as Row[],
  users: new Map<string, Row>(),
  audits: [] as { adminId: string; action: string; opts: Record<string, unknown> }[],
  notices: [] as Record<string, unknown>[],
  failAudit: false,
  figureRows: [] as Row[],
  sql: [] as { text: string; values: unknown[] }[],
  calls: [] as { model: string; op: string; args: Row }[],
  txDepth: 0,
  auditInTx: [] as boolean[],
  hold: null as Row | null,
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(async (_tx: unknown, adminId: string, action: string, opts: Record<string, unknown>) => {
    h.auditInTx.push(h.txDepth > 0);
    if (h.failAudit) throw new Error('audit down');
    h.audits.push({ adminId, action, opts });
  }),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: Record<string, unknown>) => {
    h.notices.push(n);
  }),
}));
vi.mock('@/lib/notify/dispatch.server', () => ({ dispatch: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/deliveries.server', () => ({ sendOnce: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/preferences.server', () => ({ canEmail: vi.fn(async () => false) }));
vi.mock('@/lib/auth/security-log.server', () => ({ recordSecurityEvent: vi.fn(async () => undefined) }));

/** `where` with `AND` support on top of the shared matcher; a nested `user` filter reads the joined owner. */
function match(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  const { AND, user: _user, ...rest } = where as Row & { AND?: Row[] };
  return (AND ?? []).every((w) => match(row, w)) && matches(row, rest);
}

function select(row: Row, sel: Row | undefined): Row {
  if (!sel) return { ...row };
  const out: Row = {};
  for (const [k, v] of Object.entries(sel)) {
    if (!v) continue;
    if (k === 'user') out.user = h.users.get(row.userId as string) ?? null;
    else out[k] = row[k];
  }
  return out;
}

function record(model: string, op: string, args: Row) {
  h.calls.push({ model, op, args });
}

vi.mock('@/lib/prisma.server', () => {
  const webhookEndpoint = {
    findUnique: vi.fn(async (a: Row) => {
      record('webhookEndpoint', 'findUnique', a);
      const r = h.endpoints.find((e) => match(e, a.where as Row));
      return r ? select(r, a.select as Row) : null;
    }),
    findFirst: vi.fn(async (a: Row) => {
      record('webhookEndpoint', 'findFirst', a);
      const r = h.endpoints.find((e) => match(e, a.where as Row));
      return r ? select(r, a.select as Row) : null;
    }),
    findMany: vi.fn(async (a: Row) => {
      record('webhookEndpoint', 'findMany', a);
      return h.endpoints.filter((e) => match(e, a.where as Row)).map((e) => select(e, a.select as Row));
    }),
    updateMany: vi.fn(async (a: Row) => {
      record('webhookEndpoint', 'updateMany', a);
      const hit = h.endpoints.filter((e) => match(e, a.where as Row));
      for (const e of hit) Object.assign(e, a.data);
      return { count: hit.length };
    }),
    update: vi.fn(async (a: Row) => {
      record('webhookEndpoint', 'update', a);
      const e = h.endpoints.find((x) => x.id === (a.where as Row).id)!;
      Object.assign(e, a.data);
      return { ...e };
    }),
  };
  const webhookDelivery = {
    findMany: vi.fn(async (a: Row) => {
      record('webhookDelivery', 'findMany', a);
      return h.deliveries
        .filter((d) => match(d, a.where as Row))
        .slice(0, (a.take as number) ?? 1000)
        .map((d) => select(d, a.select as Row));
    }),
    updateMany: vi.fn(async (a: Row) => {
      record('webhookDelivery', 'updateMany', a);
      const hit = h.deliveries.filter((d) => match(d, a.where as Row));
      for (const d of hit) Object.assign(d, a.data);
      return { count: hit.length };
    }),
  };
  const prisma = {
    webhookEndpoint,
    webhookDelivery,
    deletionHold: {
      findUnique: vi.fn(async () => h.hold),
      deleteMany: vi.fn(async () => {
        h.hold = null;
        return { count: 1 };
      }),
    },
    developerApiKey: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
    scheduledPost: { count: vi.fn(async () => 0) },
    user: { findUnique: vi.fn(async (a: Row) => h.users.get((a.where as Row).id as string) ?? null) },
    moderatorNote: { create: vi.fn(async () => ({})) },
    securityEvent: { create: vi.fn(async () => ({})) },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.sql.push({ text: strings.join('?'), values });
      return h.figureRows;
    }),
    $transaction: async (fn: ((tx: unknown) => Promise<unknown>) | Promise<unknown>[]) => {
      if (Array.isArray(fn)) return Promise.all(fn);
      const endpoints = h.endpoints.map((e) => ({ ...e }));
      const deliveries = h.deliveries.map((d) => ({ ...d }));
      const audits = h.audits.length;
      h.txDepth++;
      try {
        return await fn(prisma);
      } catch (e) {
        h.endpoints = endpoints;
        h.deliveries = deliveries;
        h.audits.length = audits;
        throw e;
      } finally {
        h.txDepth--;
      }
    },
  };
  return { prisma };
});

const endpoint = (over: Row = {}): Row => ({
  id: 'w1',
  userId: 'u1',
  url: FULL_URL,
  secret: SECRET,
  previousSecret: OLD_SECRET,
  previousSecretExpiresAt: null,
  events: ['*'],
  description: null,
  enabled: true,
  failureCount: 3,
  lastDeliveryAt: new Date('2026-12-01T11:00:00Z'),
  createdAt: new Date('2026-11-20T00:00:00Z'),
  adminDisabledAt: null,
  adminDisabledReason: null,
  adminDisabledById: null,
  ...over,
});

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function call(
  method: 'GET' | 'PATCH',
  params: Record<string, string>,
  opts: { query?: string; body?: unknown } = {},
) {
  const mod = params.id
    ? await import('@/lib/admin/api/admin.webhooks.$id.server')
    : await import('@/lib/admin/api/admin.webhooks.server');
  const handlers = mod.route.handlers as Record<string, Handler>;
  const res = await handlers[method]!({
    request: new Request(`https://rmhstudios.com/api/admin/webhooks${opts.query ?? ''}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    }),
    params,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const admin = () => {
  h.session = { user: { id: 'admin-1', isAdmin: true } };
};

beforeEach(() => {
  h.session = null;
  h.endpoints = [endpoint()];
  h.deliveries = [];
  h.users = new Map([
    ['u1', { id: 'u1', handle: 'owner', name: 'Owner', image: null, isAdmin: false, banReason: null }],
  ]);
  h.audits = [];
  h.auditInTx = [];
  h.notices = [];
  h.failAudit = false;
  h.figureRows = [];
  h.sql = [];
  h.calls = [];
  h.txDepth = 0;
  h.hold = null;
});

describe('admin only', () => {
  it('refuses a signed-out caller and a member on every endpoint', async () => {
    expect((await call('GET', {})).status).toBe(401);
    h.session = { user: { id: 'u9', isAdmin: false } };
    expect((await call('GET', {})).status).toBe(403);
    expect((await call('GET', { id: 'w1' })).status).toBe(403);
    const patch = await call('PATCH', { id: 'w1' }, { body: { disable: { reason: 'sends to a scam host' } } });
    expect(patch.status).toBe(403);
    expect(h.endpoints[0]!.adminDisabledAt).toBeNull();
    expect(h.audits).toEqual([]);
  });
});

describe('what a row carries', () => {
  it('never selects or returns a secret, a previous secret, a payload or a signature', async () => {
    admin();
    h.deliveries = [
      {
        id: 'd1',
        endpointId: 'w1',
        event: 'ping',
        status: 'FAILED',
        responseStatus: 500,
        durationMs: 120,
        error: `HTTP 500 from ${FULL_URL}`,
        payload: { secretPayload: 'PAYLOAD-BODY' },
        signature: 'SIGNATURE-VALUE',
        createdAt: NOW,
      },
    ];
    const list = await call('GET', {}, { query: '?filter=failing' });
    const detail = await call('GET', { id: 'w1' });
    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    for (const text of [JSON.stringify(list.json), JSON.stringify(detail.json)]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(OLD_SECRET);
      expect(text).not.toContain('PAYLOAD-BODY');
      expect(text).not.toContain('SIGNATURE-VALUE');
      expect(text).not.toMatch(/"(secret|previousSecret|payload|signature)"/);
    }
    for (const c of h.calls) {
      const sel = (c.args.select ?? {}) as Row;
      for (const k of ['secret', 'previousSecret', 'payload', 'signature'])
        expect(sel[k], `${c.model}.${c.op}`).toBeUndefined();
    }
  });

  it('shows the scheme, host and first path segment of the URL and nothing else, in rows, details and errors', async () => {
    admin();
    h.deliveries = [
      {
        id: 'd1',
        endpointId: 'w1',
        event: 'ping',
        status: 'FAILED',
        responseStatus: 502,
        durationMs: 80,
        error: `upstream said no to ${FULL_URL} (path /services/${PATH_TOKEN}/more, key=${QUERY_KEY})`,
        createdAt: NOW,
      },
    ];
    const list = await call('GET', {});
    const detail = await call('GET', { id: 'w1' });
    for (const text of [JSON.stringify(list.json), JSON.stringify(detail.json)]) {
      expect(text).not.toContain(PATH_TOKEN);
      expect(text).not.toContain(QUERY_KEY);
      expect(text).not.toContain('/more');
      expect(text).toContain('https://hooks.example.com/services…');
    }
    const row = (list.json as { webhooks: { url: string; host: string }[] }).webhooks[0]!;
    expect(row.url).toBe('https://hooks.example.com/services…');
    expect(row.host).toBe('hooks.example.com');
  });

  it('redacts the URL before it truncates the error text to 200 characters', async () => {
    admin();
    h.deliveries = [
      {
        id: 'd1',
        endpointId: 'w1',
        event: 'ping',
        status: 'FAILED',
        responseStatus: null,
        durationMs: null,
        error: `${'x'.repeat(150)} ${FULL_URL} ${'y'.repeat(100)}`,
        createdAt: NOW,
      },
    ];
    const detail = await call('GET', { id: 'w1' });
    const error = (detail.json as { deliveries: { error: string }[] }).deliveries[0]!.error;
    expect(error.length).toBeLessThanOrEqual(200);
    expect(error).not.toContain(PATH_TOKEN);
    expect(error).not.toContain(QUERY_KEY);
    expect(error).not.toContain('T0KEN');
  });

  it('reads the 24-hour figures in one grouped query over webhook_delivery, with its real column names', async () => {
    admin();
    h.figureRows = [{ endpointId: 'w1', total: 10n, delivered: 7n, failed: 3n, medianMs: 142.4 }];
    const list = await call('GET', {});
    expect(h.sql).toHaveLength(1);
    const sql = h.sql[0]!.text;
    expect(sql).toContain('FROM "webhook_delivery"');
    for (const col of ['"endpointId"', '"createdAt"', '"status"', '"durationMs"']) expect(sql).toContain(col);
    expect(h.sql[0]!.values[0]).toEqual(['w1']);
    const row = (list.json as { webhooks: { figures: Record<string, unknown> }[] }).webhooks[0]!;
    expect(row.figures).toEqual({ deliveries: 10, failed: 3, failureRate: 0.3, medianMs: 142 });
  });

  it('filters: failing is failureCount above zero, admin_disabled is adminDisabledAt set, owner and host are exact', async () => {
    admin();
    await call('GET', {}, { query: '?filter=failing&owner=@Owner&host=hooks.example.com' });
    const where = JSON.stringify(h.calls.find((c) => c.model === 'webhookEndpoint' && c.op === 'findMany')!.args.where);
    expect(where).toContain('"failureCount":{"gt":0}');
    expect(where).toContain('"handle":{"equals":"Owner"');
    expect(where).toContain('https://hooks.example.com/');
    h.calls = [];
    await call('GET', {}, { query: '?filter=admin_disabled' });
    expect(JSON.stringify(h.calls.find((c) => c.op === 'findMany')!.args.where)).toContain(
      '"adminDisabledAt":{"not":null}',
    );
    h.calls = [];
    await call('GET', {}, { query: '?filter=auto_disabled' });
    const auto = JSON.stringify(h.calls.find((c) => c.op === 'findMany')!.args.where);
    expect(auto).toContain('"enabled":false');
    expect(auto).toContain('"failureCount":{"gte":20}');
    expect(auto).toContain('"adminDisabledAt":null');
  });

  it('refuses a host with a path and a cursor it did not issue', async () => {
    admin();
    expect((await call('GET', {}, { query: '?host=hooks.example.com/services/abc' })).status).toBe(400);
    expect((await call('GET', {}, { query: '?cursor=nope' })).status).toBe(400);
  });
});

describe('admin disable', () => {
  it('writes the audit row inside the same transaction, cancels pending deliveries and notifies the owner by key', async () => {
    admin();
    h.deliveries = [
      { id: 'p1', endpointId: 'w1', status: 'PENDING', error: null },
      { id: 'p2', endpointId: 'w1', status: 'DELIVERED', error: null },
    ];
    const out = await call('PATCH', { id: 'w1' }, { body: { disable: { reason: 'It posts to a phishing host.' } } });
    expect(out.status).toBe(200);
    expect(h.endpoints[0]).toMatchObject({
      enabled: false,
      adminDisabledReason: 'It posts to a phishing host.',
      adminDisabledById: 'admin-1',
    });
    expect(h.endpoints[0]!.adminDisabledAt).toBeInstanceOf(Date);
    expect(h.deliveries.find((d) => d.id === 'p1')).toMatchObject({ status: 'FAILED' });
    expect(h.deliveries.find((d) => d.id === 'p2')).toMatchObject({ status: 'DELIVERED' });
    expect(h.audits).toHaveLength(1);
    expect(h.auditInTx).toEqual([true]);
    expect(h.audits[0]).toMatchObject({ adminId: 'admin-1', action: 'webhook.admin_disable' });
    expect(h.audits[0]!.opts).toMatchObject({ targetType: 'webhook_endpoint', targetId: 'w1' });
    expect(JSON.stringify(h.audits)).not.toContain(PATH_TOKEN);
    expect(JSON.stringify(h.audits)).not.toContain(QUERY_KEY);
    expect(h.notices).toHaveLength(1);
    expect(h.notices[0]).toMatchObject({
      userId: 'u1',
      type: 'SYSTEM',
      entityType: 'webhook-admin-disabled',
      preview: {
        key: 'webhook-admin-disabled',
        params: { host: 'hooks.example.com', reason: 'It posts to a phishing host.' },
        fallback: 'An admin turned off your webhook to hooks.example.com: It posts to a phishing host.',
      },
    });
    expect(JSON.stringify(h.notices)).not.toContain(PATH_TOKEN);
    expect((out.json as { webhook: { status: string } }).webhook.status).toBe('admin_disabled');
  });

  it('rolls the whole change back when the audit write fails, and sends no notice', async () => {
    admin();
    h.failAudit = true;
    h.deliveries = [{ id: 'p1', endpointId: 'w1', status: 'PENDING', error: null }];
    const out = await call('PATCH', { id: 'w1' }, { body: { disable: { reason: 'It posts to a phishing host.' } } });
    expect(out.status).toBe(500);
    expect(h.endpoints[0]).toMatchObject({ enabled: true, adminDisabledAt: null, adminDisabledReason: null });
    expect(h.deliveries[0]).toMatchObject({ status: 'PENDING' });
    expect(h.notices).toEqual([]);
  });

  it('needs a reason, and a second admin cannot disable it twice', async () => {
    admin();
    expect((await call('PATCH', { id: 'w1' }, { body: { disable: { reason: ' ' } } })).status).toBe(400);
    expect((await call('PATCH', { id: 'w1' }, { body: { disable: { reason: 'x'.repeat(301) } } })).status).toBe(400);
    expect((await call('PATCH', { id: 'w1' }, { body: { disable: { reason: 'first reason' } } })).status).toBe(200);
    const again = await call('PATCH', { id: 'w1' }, { body: { disable: { reason: 'second reason' } } });
    expect(again.status).toBe(409);
    expect(h.endpoints[0]!.adminDisabledReason).toBe('first reason');
    expect(h.audits).toHaveLength(1);
    expect(h.notices).toHaveLength(1);
    expect((await call('PATCH', { id: 'missing' }, { body: { disable: { reason: 'first reason' } } })).status).toBe(
      404,
    );
  });
});

describe('the owner and an admin disable', () => {
  it("refuses the owner's enable with the reason and code, and changes nothing", async () => {
    admin();
    await call('PATCH', { id: 'w1' }, { body: { disable: { reason: 'Receiver is not yours.' } } });
    const { updateWebhook, sendTestEvent } = await import('@/lib/developer/webhooks.server');
    const out = await updateWebhook('u1', 'w1', { enabled: true });
    expect(out).toMatchObject({
      ok: false,
      status: 409,
      code: 'admin_disabled',
      reason: 'Receiver is not yours.',
    });
    expect(h.endpoints[0]).toMatchObject({ enabled: false, failureCount: 3 });
    // The conditional write is what holds the line, not only a pre-check.
    const write = h.calls.filter((c) => c.model === 'webhookEndpoint' && c.op === 'updateMany').at(-1)!;
    expect((write.args.where as Row).adminDisabledAt).toBeNull();
    // Nor does a test ping go to it.
    expect(await sendTestEvent('u1', 'w1')).toMatchObject({ ok: false, status: 409, code: 'admin_disabled' });
  });

  it('still lets the owner turn off or edit an endpoint, and enable one an admin never touched', async () => {
    const { updateWebhook } = await import('@/lib/developer/webhooks.server');
    h.endpoints = [endpoint({ enabled: false, failureCount: 20 })];
    const on = await updateWebhook('u1', 'w1', { enabled: true });
    expect(on.ok).toBe(true);
    expect(h.endpoints[0]).toMatchObject({ enabled: true, failureCount: 0 });
  });

  it('lift clears the three columns and leaves the endpoint off, audited in its transaction', async () => {
    admin();
    await call('PATCH', { id: 'w1' }, { body: { disable: { reason: 'Receiver is not yours.' } } });
    h.audits = [];
    h.auditInTx = [];
    const out = await call('PATCH', { id: 'w1' }, { body: { disable: null } });
    expect(out.status).toBe(200);
    expect(h.endpoints[0]).toMatchObject({
      enabled: false,
      adminDisabledAt: null,
      adminDisabledReason: null,
      adminDisabledById: null,
    });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({ action: 'webhook.admin_lift' });
    expect(h.auditInTx).toEqual([true]);
    expect((out.json as { webhook: { status: string } }).webhook.status).not.toBe('admin_disabled');
    // Lifting an endpoint that is not blocked is a conflict, and writes no audit row.
    expect((await call('PATCH', { id: 'w1' }, { body: { disable: null } })).status).toBe(409);
    expect(h.audits).toHaveLength(1);
    const { updateWebhook } = await import('@/lib/developer/webhooks.server');
    expect((await updateWebhook('u1', 'w1', { enabled: true })).ok).toBe(true);
  });
});

describe('writers of `enabled` that must not clear an admin disable', () => {
  it('secure-account replaces secrets and switches endpoints off but leaves the admin disable in place', async () => {
    admin();
    await call('PATCH', { id: 'w1' }, { body: { disable: { reason: 'Receiver is not yours.' } } });
    h.users.set('target', { id: 'target', isAdmin: false, banReason: null });
    h.endpoints[0]!.userId = 'target';
    const { secureAccount } = await import('@/lib/admin/secure-account.server');
    const out = await secureAccount('admin-1', 'target', { groups: ['webhooks'], reason: 'Reported as compromised' });
    expect(out.ok).toBe(true);
    expect(h.endpoints[0]).toMatchObject({ enabled: false });
    expect(h.endpoints[0]!.adminDisabledAt).toBeInstanceOf(Date);
    expect(h.endpoints[0]!.adminDisabledReason).toBe('Receiver is not yours.');
    expect(h.endpoints[0]!.adminDisabledById).toBe('admin-1');
  });

  it('the deletion hold restore never re-enables an admin-disabled endpoint', async () => {
    const at = new Date('2026-12-01T00:00:00Z');
    h.hold = { userId: 'u1', keyIds: [], webhookIds: ['w-admin', 'w-plain'], createdAt: at };
    h.endpoints = [
      endpoint({ id: 'w-admin', enabled: false, failureCount: 0, adminDisabledAt: at }),
      endpoint({ id: 'w-plain', enabled: false, failureCount: 4 }),
    ];
    const { restoreAfterCancel } = await import('@/lib/account/deletion-hold.server');
    await restoreAfterCancel('u1', new Date('2026-12-02T00:00:00Z'));
    expect(h.endpoints.find((r) => r.id === 'w-admin')).toMatchObject({ enabled: false });
    expect(h.endpoints.find((r) => r.id === 'w-plain')).toMatchObject({ enabled: true, failureCount: 0 });
    expect(h.hold).toBeNull();
  });
});

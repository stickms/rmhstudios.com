/**
 * s09-14: a deletion request stops everything that acts for the member at once. Prisma is a small in-memory fake;
 * the sessions, tokens and calendar steps are `secureAccount`'s own exported functions, not copies.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDb } from './deletion-hold-fake-db';
import { DELETION_REQUESTED } from '@/lib/account/deletion-hold';

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import('./deletion-hold-fake-db').makeDb>,
  cancelled: [] as string[][],
  scheduleDeletion: vi.fn(async () => new Date('2026-12-30T00:00:00Z')),
  session: { user: { id: 'u1' } } as { user: { id: string } } | null,
}));

vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return h.fake.db;
  },
}));
vi.mock('@/lib/bulk/bulk.server', () => ({
  cancelBulkOperation: vi.fn(async (userId: string, id: string) => {
    h.cancelled.push([userId, id]);
    return true;
  }),
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin-audit.server', () => ({ recordAdminActionIn: vi.fn() }));
vi.mock('@/lib/notify/dispatch.server', () => ({ dispatch: vi.fn() }));
vi.mock('@/lib/email/deliveries.server', () => ({ sendOnce: vi.fn() }));
vi.mock('@/lib/email/preferences.server', () => ({ canEmail: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/account/deletion.server', () => ({
  scheduleDeletion: h.scheduleDeletion,
  DELETION_GRACE_DAYS: 30,
}));
vi.mock('@/lib/storage/s3.server', () => ({ deleteObject: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/send.server', () => ({ sendEmail: vi.fn(async () => undefined) }));

import { pauseForDeletion, previewDeletionPause } from '@/lib/account/deletion-hold.server';

const NOW = new Date('2026-11-30T12:00:00Z');

function seed() {
  return makeDb({
    session: [
      { id: 's1', userId: 'u1' },
      { id: 's2', userId: 'u1' },
      { id: 's3', userId: 'other' },
    ],
    verification: [{ id: 'v1', value: 'u1' }],
    pushSubscription: [{ id: 'p1', userId: 'u1' }],
    developerApiKey: [
      { id: 'k-active', userId: 'u1', revokedAt: null, suspendedAt: null, suspendReason: null },
      { id: 'k-admin', userId: 'u1', revokedAt: null, suspendedAt: new Date('2026-11-01'), suspendReason: 'abuse' },
      { id: 'k-revoked', userId: 'u1', revokedAt: new Date('2026-10-01'), suspendedAt: null, suspendReason: null },
      { id: 'k-other', userId: 'other', revokedAt: null, suspendedAt: null, suspendReason: null },
    ],
    webhookEndpoint: [
      { id: 'w-on', userId: 'u1', enabled: true, secret: 'whsec_a' },
      { id: 'w-off', userId: 'u1', enabled: false, secret: 'whsec_b' },
      { id: 'w-other', userId: 'other', enabled: true, secret: 'whsec_c' },
    ],
    rmhCodeToken: [{ id: 't1', userId: 'u1', revokedAt: null }],
    calendarFeed: [{ id: 'c1', userId: 'u1', token: 'old-token' }],
    bulkOperation: [
      { id: 'b1', userId: 'u1', status: 'PENDING' },
      { id: 'b2', userId: 'u1', status: 'RUNNING' },
      { id: 'b3', userId: 'u1', status: 'DONE' },
    ],
    scheduledPost: [
      { id: 'sp1', userId: 'u1', publishedId: null, scheduledAt: new Date('2026-12-01') },
      { id: 'sp2', userId: 'u1', publishedId: 'x', scheduledAt: new Date('2026-11-01') },
      { id: 'sp3', userId: 'u1', publishedId: null, scheduledAt: null },
    ],
  });
}

beforeEach(() => {
  h.fake = seed();
  h.cancelled.length = 0;
  h.scheduleDeletion.mockClear();
  h.session = { user: { id: 'u1' } };
});

describe('pauseForDeletion', () => {
  it('deletes every session of the account (and nobody else’s), with its reset links and push subscriptions', async () => {
    await pauseForDeletion('u1', NOW);
    expect(h.fake.tables.session?.map((r) => r.id)).toEqual(['s3']);
    expect(h.fake.tables.verification).toEqual([]);
    expect(h.fake.tables.pushSubscription).toEqual([]);
  });

  it('suspends only active keys, with the deletion reason, and records exactly those ids', async () => {
    await pauseForDeletion('u1', NOW);
    const keys = Object.fromEntries((h.fake.tables.developerApiKey ?? []).map((k) => [k.id, k]));
    expect(keys['k-active']).toMatchObject({ suspendedAt: NOW, suspendReason: DELETION_REQUESTED });
    expect(keys['k-admin']).toMatchObject({ suspendReason: 'abuse' });
    expect(keys['k-revoked']).toMatchObject({ suspendedAt: null });
    expect(keys['k-other']).toMatchObject({ suspendedAt: null });
    expect(h.fake.tables.deletionHold?.[0]).toMatchObject({ userId: 'u1', keyIds: ['k-active'] });
  });

  it('disables only enabled webhooks, keeps their secrets, and records exactly those ids', async () => {
    await pauseForDeletion('u1', NOW);
    const hooks = Object.fromEntries((h.fake.tables.webhookEndpoint ?? []).map((w) => [w.id, w]));
    expect(hooks['w-on']).toMatchObject({ enabled: false, secret: 'whsec_a' });
    expect(hooks['w-off']).toMatchObject({ enabled: false, secret: 'whsec_b' });
    expect(hooks['w-other']).toMatchObject({ enabled: true });
    expect(h.fake.tables.deletionHold?.[0]).toMatchObject({ webhookIds: ['w-on'] });
  });

  it('revokes CLI tokens, rotates the calendar feed and cancels queued bulk operations', async () => {
    await pauseForDeletion('u1', NOW);
    expect(h.fake.tables.rmhCodeToken?.[0]).toMatchObject({ revokedAt: NOW });
    expect(h.fake.tables.calendarFeed?.[0]?.token).not.toBe('old-token');
    expect(h.cancelled).toEqual([
      ['u1', 'b1'],
      ['u1', 'b2'],
    ]);
  });

  it('a second request keeps the first one’s record (nothing new to pause)', async () => {
    await pauseForDeletion('u1', NOW);
    await pauseForDeletion('u1', new Date(NOW.getTime() + 1000));
    expect(h.fake.tables.deletionHold).toHaveLength(1);
    expect(h.fake.tables.deletionHold?.[0]).toMatchObject({
      keyIds: ['k-active'],
      webhookIds: ['w-on'],
      createdAt: NOW,
    });
  });

  it('writes the hold in the same transaction as the key and webhook changes', async () => {
    await pauseForDeletion('u1', NOW);
    expect(h.fake.db.$transaction as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });
});

describe('previewDeletionPause', () => {
  it('counts what the request would stop: active keys, enabled webhooks, scheduled posts', async () => {
    expect(await previewDeletionPause('u1')).toEqual({ apiKeys: 1, webhooks: 1, scheduledPosts: 1 });
  });
});

describe('POST /api/account/delete', () => {
  const handler = async () => {
    const { route } = await import('@/lib/account/api/account.delete.server');
    return (route.handlers.POST as (a: { request: Request; params: Record<string, string> }) => Promise<Response>)({
      request: new Request('https://rmhstudios.com/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'better-auth.session_token=abc' },
        body: JSON.stringify({ confirm: 'sam' }),
      }),
      params: {},
    });
  };

  beforeEach(() => {
    h.fake.tables.user = [{ id: 'u1', handle: 'sam', username: 'sam', email: null }];
  });

  it('pauses first, then schedules, and tells the client every session is gone', async () => {
    const res = await handler();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, signOut: true });
    expect(h.scheduleDeletion).toHaveBeenCalledWith('u1');
    expect(h.fake.tables.deletionHold).toHaveLength(1);
  });

  it('a failing pause step fails the request with 500 and never schedules the deletion', async () => {
    (h.fake.db.pushSubscription as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany.mockRejectedValueOnce(
      new Error('db down'),
    );
    const res = await handler();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('db down');
    expect(h.scheduleDeletion).not.toHaveBeenCalled();
  });
});

describe('the SQL and table names', () => {
  it('the hold maps to deletion_hold with camelCase columns', async () => {
    const { readFileSync } = await import('node:fs');
    const schema = readFileSync('prisma/schema/deletion.prisma', 'utf8');
    expect(schema).toContain('@@map("deletion_hold")');
    const sql = readFileSync('prisma/migrations/20261129050200_s09_deletion_pause/migration.sql', 'utf8');
    for (const col of ['"userId"', '"keyIds"', '"webhookIds"', '"createdAt"']) expect(sql).toContain(col);
  });
});

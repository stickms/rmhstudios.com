/**
 * s09-14: signing back in restores exactly what the deletion request paused, and nothing the member or an admin
 * had already switched off. Prisma is an in-memory fake.
 */
import { noticeFallbackText } from '@/lib/notifications/notice-keys';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDb } from './deletion-hold-fake-db';
import { DELETION_REQUESTED, planRestore } from '@/lib/account/deletion-hold';

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import('./deletion-hold-fake-db').makeDb>,
  notices: [] as Record<string, unknown>[],
  queued: [] as string[],
}));

vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return h.fake.db;
  },
}));
vi.mock('@/lib/account/deletion-billing-queue.server', () => ({
  enqueueBillingSync: vi.fn(async (userId: string) => {
    h.queued.push(userId);
    return true;
  }),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: Record<string, unknown>) => {
    h.notices.push(n);
  }),
}));
vi.mock('@/lib/auth/security-log.server', () => ({ recordSecurityEvent: vi.fn(async () => undefined) }));

import { pauseForDeletion, restoreAfterCancel } from '@/lib/account/deletion-hold.server';
import { cancelDeletion } from '@/lib/account/deletion.server';

const HOLD_AT = new Date('2026-11-30T12:00:00Z');
const NOW = new Date('2026-12-03T09:00:00Z');

function seed(extra: Record<string, Record<string, unknown>[]> = {}) {
  return makeDb({
    deletionHold: [
      {
        userId: 'u1',
        keyIds: ['k-mine', 'k-admin-later', 'k-lifted'],
        webhookIds: ['w-mine', 'w-reenabled'],
        createdAt: HOLD_AT,
      },
    ],
    developerApiKey: [
      { id: 'k-mine', userId: 'u1', revokedAt: null, suspendedAt: HOLD_AT, suspendReason: DELETION_REQUESTED },
      // An admin re-suspended it after the hold: their suspension must stay.
      {
        id: 'k-admin-later',
        userId: 'u1',
        revokedAt: null,
        suspendedAt: new Date('2026-12-01'),
        suspendReason: 'abuse',
      },
      { id: 'k-lifted', userId: 'u1', revokedAt: null, suspendedAt: null, suspendReason: null },
      // Suspended by an admin BEFORE the request: never in the hold, stays suspended.
      {
        id: 'k-admin-before',
        userId: 'u1',
        revokedAt: null,
        suspendedAt: new Date('2026-10-01'),
        suspendReason: 'abuse',
      },
    ],
    webhookEndpoint: [
      { id: 'w-mine', userId: 'u1', enabled: false, failureCount: 7 },
      { id: 'w-reenabled', userId: 'u1', enabled: true, failureCount: 0 },
      // The member had turned this one off themselves: never in the hold, stays off.
      { id: 'w-self-off', userId: 'u1', enabled: false, failureCount: 0 },
    ],
    ...extra,
  });
}

beforeEach(() => {
  h.fake = seed();
  h.notices.length = 0;
  h.queued.length = 0;
});

const byId = (name: string) => Object.fromEntries((h.fake.tables[name] ?? []).map((r) => [r.id as string, r]));

describe('restoreAfterCancel', () => {
  it('lifts the held key and re-enables the held webhook with its failure count reset', async () => {
    await restoreAfterCancel('u1', NOW);
    expect(byId('developerApiKey')['k-mine']).toMatchObject({ suspendedAt: null, suspendReason: null });
    expect(byId('webhookEndpoint')['w-mine']).toMatchObject({ enabled: true, failureCount: 0 });
  });

  it('leaves an admin-suspended key suspended, before or after the request', async () => {
    await restoreAfterCancel('u1', NOW);
    expect(byId('developerApiKey')['k-admin-later']).toMatchObject({ suspendReason: 'abuse' });
    expect(byId('developerApiKey')['k-admin-before']).toMatchObject({ suspendReason: 'abuse' });
  });

  it('leaves a webhook the member had already disabled disabled', async () => {
    await restoreAfterCancel('u1', NOW);
    expect(byId('webhookEndpoint')['w-self-off']).toMatchObject({ enabled: false });
  });

  it('restores exactly the planned ids: the writes name nothing else', async () => {
    await restoreAfterCancel('u1', NOW);
    const keyWrite = h.fake.calls.find((c) => c.model === 'developerApiKey' && c.op === 'updateMany');
    expect((keyWrite?.args.where as { id: { in: string[] } }).id.in).toEqual(['k-mine']);
    const hookWrite = h.fake.calls.find((c) => c.model === 'webhookEndpoint' && c.op === 'updateMany');
    expect((hookWrite?.args.where as { id: { in: string[] } }).id.in).toEqual(['w-mine']);
  });

  it('keeps the hold for the billing sync, clears its keys and webhooks, nulls the done-stamp and queues the sync', async () => {
    h.fake.tables.deletionHold![0]!.billingSyncedAt = HOLD_AT;
    await restoreAfterCancel('u1', NOW);
    expect(h.fake.tables.deletionHold).toEqual([
      { userId: 'u1', keyIds: [], webhookIds: [], createdAt: HOLD_AT, billingSyncedAt: null },
    ]);
    expect(h.queued).toEqual(['u1']);
  });

  it('keeps the hold and queues the sync even with no recorded subscription ids', async () => {
    h.fake = makeDb({
      deletionHold: [{ userId: 'u1', keyIds: [], webhookIds: [], subscriptionIds: [], createdAt: HOLD_AT }],
    });
    await restoreAfterCancel('u1', NOW);
    expect(h.fake.tables.deletionHold).toHaveLength(1);
    expect(h.queued).toEqual(['u1']);
  });

  it('a request nulls the done-stamp in the same write that records the hold, new hold or existing', async () => {
    h.fake = makeDb({ user: [{ id: 'u1' }] });
    await pauseForDeletion('u1', NOW);
    expect(h.fake.tables.deletionHold).toEqual([
      { subscriptionIds: [], userId: 'u1', keyIds: [], webhookIds: [], createdAt: NOW, billingSyncedAt: null },
    ]);
    h.fake.tables.deletionHold![0]!.billingSyncedAt = NOW;
    await pauseForDeletion('u1', NOW);
    expect(h.fake.tables.deletionHold![0]!.billingSyncedAt).toBeNull();
    expect(h.queued).toEqual(['u1', 'u1']);
  });

  it('does nothing without a hold', async () => {
    h.fake = makeDb({});
    await restoreAfterCancel('u1', NOW);
    expect(h.fake.calls.filter((c) => c.op === 'updateMany')).toHaveLength(0);
    expect(h.notices).toHaveLength(0);
  });

  it('sends one notice when scheduled posts came due during the hold, and leaves them drafts', async () => {
    h.fake = seed({
      scheduledPost: [
        { id: 'sp-due-1', userId: 'u1', publishedId: null, scheduledAt: new Date('2026-12-01T10:00:00Z') },
        { id: 'sp-due-2', userId: 'u1', publishedId: null, scheduledAt: new Date('2026-12-02T10:00:00Z') },
        { id: 'sp-future', userId: 'u1', publishedId: null, scheduledAt: new Date('2026-12-20T10:00:00Z') },
        { id: 'sp-before', userId: 'u1', publishedId: null, scheduledAt: new Date('2026-11-01T10:00:00Z') },
        { id: 'sp-sent', userId: 'u1', publishedId: 'post', scheduledAt: new Date('2026-12-01T10:00:00Z') },
      ],
    });
    await restoreAfterCancel('u1', NOW);
    expect(h.notices).toHaveLength(1);
    expect(h.notices[0]).toMatchObject({
      userId: 'u1',
      type: 'SYSTEM',
      entityType: 'deletion-drafts-waited',
      link: '/drafts',
    });
    expect(noticeFallbackText(h.notices[0]?.preview as never)).toContain('2 scheduled posts were not published');
    expect(h.fake.tables.scheduledPost).toHaveLength(5);
  });

  it('sends no notice when nothing came due', async () => {
    await restoreAfterCancel('u1', NOW);
    expect(h.notices).toHaveLength(0);
  });
});

describe('planRestore (pure)', () => {
  it('keeps a revoked key out of the plan', () => {
    const plan = planRestore(
      { keyIds: ['a'], webhookIds: [] },
      [{ id: 'a', revokedAt: new Date(), suspendedAt: HOLD_AT, suspendReason: DELETION_REQUESTED }],
      [],
    );
    expect(plan.keyIds).toEqual([]);
  });
});

describe('cancelDeletion', () => {
  it('restores after the conditional update succeeds, and not when it did not', async () => {
    h.fake.tables.user = [{ id: 'u1', deletionScheduledAt: new Date('2026-12-30'), banReason: null }];
    expect(await cancelDeletion('u1')).toBe(true);
    expect(byId('developerApiKey')['k-mine']).toMatchObject({ suspendedAt: null });
    expect(h.fake.tables.deletionHold).toMatchObject([{ keyIds: [], webhookIds: [], billingSyncedAt: null }]);

    // Not scheduled: nothing to cancel, and a hold for a key that is no longer as the hold left it is cleared
    // without lifting anything.
    h.fake.tables.deletionHold = [{ userId: 'u1', keyIds: ['k-admin-later'], webhookIds: [], createdAt: HOLD_AT }];
    expect(await cancelDeletion('u1')).toBe(false);
    expect(byId('developerApiKey')['k-admin-later']).toMatchObject({ suspendReason: 'abuse' });
  });

  it('retries a hold left behind by a failed restore on the next sign-in', async () => {
    h.fake.tables.user = [{ id: 'u1', deletionScheduledAt: new Date('2026-12-30'), banReason: null }];
    const find = (h.fake.db.deletionHold as { findUnique: ReturnType<typeof vi.fn> }).findUnique;
    find.mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await cancelDeletion('u1')).toBe(true);
    expect(h.fake.tables.deletionHold).toHaveLength(1);
    // The deletion is no longer pending; the next sign-in finishes the restore.
    expect(await cancelDeletion('u1')).toBe(false);
    expect(h.fake.tables.deletionHold).toMatchObject([{ keyIds: [], webhookIds: [] }]);
    expect(byId('developerApiKey')['k-mine']).toMatchObject({ suspendedAt: null });
  });

  it('a failing restore does not fail the sign-in', async () => {
    h.fake.tables.user = [{ id: 'u1', deletionScheduledAt: new Date('2026-12-30'), banReason: null }];
    (h.fake.db.deletionHold as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockRejectedValueOnce(
      new Error('db down'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(cancelDeletion('u1')).resolves.toBe(true);
  });
});

/** POST /api/rmharks/:id/unlock — coin transfer + unlock row, and the insufficient-balance path. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  post: null as Record<string, unknown> | null,
  already: null as { id: string } | null,
  transfers: [] as unknown[][],
  unlockRows: [] as unknown[],
  notifications: [] as unknown[],
  fundsOk: true,
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'buyer', name: 'Buyer' }, session: {} }) } },
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  getClientIp: () => '1.1.1.1',
}));
vi.mock('@/lib/feed/audience.server', () => ({ canReadThread: async () => true }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: unknown) => void h.notifications.push(n),
}));
vi.mock('@/lib/economy/ledger.server', () => ({
  transferCoins: async (...a: unknown[]) => {
    if (!h.fundsOk) throw new Error('INSUFFICIENT_COINS');
    h.transfers.push(a);
  },
}));
vi.mock('@/lib/prisma.server', () => {
  const tx = { postUnlock: { create: async (a: unknown) => void h.unlockRows.push(a) } };
  return {
    prisma: {
      rMHark: { findUnique: async () => h.post },
      postUnlock: { findUnique: async () => h.already },
      $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    },
  };
});

import { Route } from '../../../app/routes/api/rmharks/$id/unlock';

const unlock = () =>
  (Route as unknown as { options: { server: { handlers: { POST: (a: unknown) => Promise<Response> } } } })
    .options.server.handlers.POST({ params: { id: 'p1' }, request: new Request('https://x.test/u', { method: 'POST' }) });

beforeEach(() => {
  h.post = { id: 'p1', userId: 'author', unlockPrice: 40, content: 'PAID', deletedAt: null, audience: 'PUBLIC', communityId: null };
  h.already = null;
  h.transfers = [];
  h.unlockRows = [];
  h.notifications = [];
  h.fundsOk = true;
});

describe('post unlock', () => {
  it('moves the price buyer -> author, records the unlock, notifies, then returns the body', async () => {
    const res = await unlock();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, content: 'PAID' });
    expect(h.transfers).toHaveLength(1);
    expect(h.transfers[0].slice(0, 3)).toEqual(['buyer', 'author', 40]);
    expect(h.transfers[0][3]).toMatchObject({ type: 'PURCHASE', idempotencyKey: 'post-unlock:buyer:p1' });
    expect(h.unlockRows).toEqual([{ data: { userId: 'buyer', rmheetId: 'p1', pricePaid: 40 } }]);
    expect(h.notifications).toHaveLength(1);
  });

  it('insufficient balance: 400, no unlock row, no body, no notification', async () => {
    h.fundsOk = false;
    const res = await unlock();
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('PAID');
    expect(h.unlockRows).toHaveLength(0);
    expect(h.notifications).toHaveLength(0);
  });

  it('already unlocked: no second charge', async () => {
    h.already = { id: 'u' };
    const res = await unlock();
    expect(await res.json()).toMatchObject({ alreadyUnlocked: true });
    expect(h.transfers).toHaveLength(0);
  });
});

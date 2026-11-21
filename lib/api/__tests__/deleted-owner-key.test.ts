/**
 * Defence in depth: an API key whose owner is an erased account never authenticates, even if the
 * key row survived erasure.
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: { developerApiKey: { findUnique: h.findUnique, update: vi.fn() } },
}));
vi.mock('@/lib/entitlements', () => ({
  getUserTier: vi.fn(async () => 'starter'),
  hasApiAccess: () => true,
}));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: vi.fn(async () => null) }));

import { authenticateApiKey, generateApiKey } from '@/lib/api/developer-auth.server';

const row = (user: { id: string; banReason: string | null }) => ({
  id: 'key-1',
  userId: user.id,
  revokedAt: null,
  expiresAt: null,
  scopes: [],
  testMode: false,
  allowedCidrs: [],
  rateLimitPerMinute: null,
  user,
});
const req = () =>
  new Request('https://x.test/api/v1/me', {
    headers: { authorization: `Bearer ${generateApiKey().plaintext}` },
  });

describe('authenticateApiKey (erased owner)', () => {
  it('rejects a live key whose owner is a deletion tombstone', async () => {
    h.findUnique.mockResolvedValueOnce(row({ id: 'u1', banReason: 'account_deleted' }));
    const res = await authenticateApiKey(req());
    expect(res).toMatchObject({ ok: false, status: 401, code: 'invalid_key' });
  });

  it('still accepts a key owned by a normal account', async () => {
    h.findUnique.mockResolvedValueOnce(row({ id: 'u2', banReason: null }));
    const res = await authenticateApiKey(req());
    expect(res).toMatchObject({ ok: true, userId: 'u2' });
  });
});

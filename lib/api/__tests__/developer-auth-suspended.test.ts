/**
 * s08-08: a suspended key is refused with 403 `key_suspended` and a fixed message that never carries
 * the reason; revoked and expired still read as they did; lifting restores access; the rate limiter
 * applies the lowest of the tier's, the owner's and the admin's limit.
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    developerApiKey: {
      findUnique: h.findUnique,
      update: vi.fn(),
    },
  },
}));
vi.mock('@/lib/entitlements', () => ({
  getUserTier: vi.fn(async () => 'starter'),
  hasApiAccess: () => true,
}));
vi.mock('@/lib/admin-audit.server', () => ({
  getActiveBan: vi.fn(async () => null),
}));

import { authenticateApiKey, generateApiKey, SUSPENDED_MESSAGE } from '@/lib/api/developer-auth.server';
import { effectiveRateLimit } from '@/lib/admin/api-keys';
import { DEFAULT_STATUS, ERROR_TYPES } from '@/lib/api/errors';

const REASON = 'scraping every profile in the directory';
const row = (over: Record<string, unknown> = {}) => ({
  id: 'key-1',
  userId: 'u1',
  revokedAt: null,
  expiresAt: null,
  suspendedAt: null,
  adminRateLimitPerMinute: null,
  scopes: [],
  testMode: false,
  allowedCidrs: [],
  rateLimitPerMinute: null,
  user: {
    id: 'u1',
    banReason: null,
  },
  ...over,
});
const req = () =>
  new Request('https://x.test/api/v1/me', {
    headers: {
      authorization: `Bearer ${generateApiKey().plaintext}`,
    },
  });

describe('authenticateApiKey (suspended)', () => {
  it('refuses a suspended key with 403 key_suspended and the fixed message', async () => {
    h.findUnique.mockResolvedValueOnce(
      row({
        suspendedAt: new Date(),
        suspendReason: REASON,
      }),
    );
    const res = await authenticateApiKey(req());
    expect(res).toEqual({
      ok: false,
      status: 403,
      code: 'key_suspended',
      message: SUSPENDED_MESSAGE,
    });
    expect(JSON.stringify(res)).not.toContain(REASON);
    expect(SUSPENDED_MESSAGE).toBe(
      'This API key was suspended by RMH Studios. Its owner can see why on the developer keys page.',
    );
  });

  it('never selects the reason, so it cannot reach a response', async () => {
    h.findUnique.mockResolvedValueOnce(row());
    await authenticateApiKey(req());
    const select = h.findUnique.mock.calls.at(-1)![0].select as Record<string, unknown>;
    expect(select.suspendReason).toBeUndefined();
    expect(select.suspendedAt).toBe(true);
  });

  it('lets a revoked key read as invalid and an expired one as expired, even when suspended', async () => {
    h.findUnique.mockResolvedValueOnce(
      row({
        suspendedAt: new Date(),
        revokedAt: new Date(),
      }),
    );
    expect(await authenticateApiKey(req())).toMatchObject({
      ok: false,
      status: 401,
      code: 'invalid_key',
    });
    h.findUnique.mockResolvedValueOnce(
      row({
        suspendedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
      }),
    );
    expect(await authenticateApiKey(req())).toMatchObject({
      ok: false,
      status: 401,
      code: 'key_expired',
    });
  });

  it('restores access when the suspension is lifted, with the same key', async () => {
    h.findUnique.mockResolvedValueOnce(
      row({
        suspendedAt: new Date(),
      }),
    );
    expect(await authenticateApiKey(req())).toMatchObject({
      ok: false,
      code: 'key_suspended',
    });
    h.findUnique.mockResolvedValueOnce(
      row({
        suspendedAt: null,
      }),
    );
    expect(await authenticateApiKey(req())).toMatchObject({
      ok: true,
      keyId: 'key-1',
    });
  });

  it('hands the admin cap to the limiter', async () => {
    h.findUnique.mockResolvedValueOnce(
      row({
        adminRateLimitPerMinute: 25,
      }),
    );
    expect(await authenticateApiKey(req())).toMatchObject({
      ok: true,
      adminRateLimitPerMinute: 25,
    });
  });

  it('lists the code with its type and status', () => {
    expect(ERROR_TYPES.key_suspended).toBe('authorization_error');
    expect(DEFAULT_STATUS.key_suspended).toBe(403);
  });
});

describe('effective rate limit', () => {
  it('is the minimum of the tier, the owner and the admin', () => {
    expect(effectiveRateLimit('starter', null, null)).toBe(120);
    expect(effectiveRateLimit('starter', 60, null)).toBe(60);
    expect(effectiveRateLimit('starter', null, 30)).toBe(30);
    expect(effectiveRateLimit('starter', 60, 30)).toBe(30);
    expect(effectiveRateLimit('starter', 20, 30)).toBe(20);
    expect(effectiveRateLimit('pro', null, 600)).toBe(600);
    expect(effectiveRateLimit('starter', null, 600)).toBe(120);
  });
});

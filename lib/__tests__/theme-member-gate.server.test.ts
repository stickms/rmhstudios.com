import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * §14.2 member gate: authoring (create/update/publish) requires an active
 * membership — the same `getUserTier` entitlement the rest of the economy reads;
 * any paid tier passes, `free` is rejected server-side. Buying stays open (not
 * covered here — no gate on the buy path). Prisma + entitlements are mocked so
 * the module loads without a DATABASE_URL or a real Stripe subscription.
 */

const getUserTier = vi.hoisted(() => vi.fn());
vi.mock('@/lib/entitlements', () => ({ getUserTier }));

const prismaMock = vi.hoisted(() => ({
  userTheme: {
    count: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { requireMember, createTheme, publishTheme, ThemeError } from '@/lib/themes/themes.server';
import { DEFAULT_THEME_TOKENS } from '@/lib/themes/tokens';

beforeEach(() => {
  getUserTier.mockReset();
  prismaMock.userTheme.count.mockReset();
  prismaMock.userTheme.create.mockReset();
  prismaMock.userTheme.findUnique.mockReset();
  prismaMock.userTheme.update.mockReset();
});

describe('requireMember', () => {
  it('rejects a free-tier user', async () => {
    getUserTier.mockResolvedValue('free');
    await expect(requireMember('u')).rejects.toBeInstanceOf(ThemeError);
    await expect(requireMember('u')).rejects.toMatchObject({ message: 'MEMBERS_ONLY' });
  });

  it('allows any paid tier', async () => {
    for (const tier of ['starter', 'pro', 'enterprise']) {
      getUserTier.mockResolvedValue(tier);
      await expect(requireMember('u')).resolves.toBeUndefined();
    }
  });

  it('fails closed to free when the entitlement lookup throws', async () => {
    getUserTier.mockRejectedValue(new Error('db down'));
    await expect(requireMember('u')).rejects.toMatchObject({ message: 'MEMBERS_ONLY' });
  });
});

describe('createTheme is gated before any write', () => {
  it('rejects a non-member without creating a row', async () => {
    getUserTier.mockResolvedValue('free');
    await expect(createTheme('u', 'My theme', DEFAULT_THEME_TOKENS)).rejects.toMatchObject({
      message: 'MEMBERS_ONLY',
    });
    expect(prismaMock.userTheme.create).not.toHaveBeenCalled();
    expect(prismaMock.userTheme.count).not.toHaveBeenCalled();
  });

  it('lets a member create a draft', async () => {
    getUserTier.mockResolvedValue('pro');
    prismaMock.userTheme.count.mockResolvedValue(0);
    prismaMock.userTheme.create.mockResolvedValue({ id: 'theme_1' });
    await expect(createTheme('u', 'My theme', DEFAULT_THEME_TOKENS)).resolves.toBe('theme_1');
    expect(prismaMock.userTheme.create).toHaveBeenCalledTimes(1);
  });
});

describe('publishTheme is gated', () => {
  it('rejects a non-member before touching the row', async () => {
    getUserTier.mockResolvedValue('free');
    await expect(publishTheme('u', 'theme_1', 500)).rejects.toMatchObject({ message: 'MEMBERS_ONLY' });
    expect(prismaMock.userTheme.findUnique).not.toHaveBeenCalled();
  });
});

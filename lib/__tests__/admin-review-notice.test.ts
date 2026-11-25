import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The admins' review alerts are keys (sprint 12, feature 19): `notifyAdminsOfReview({ notice })` stores the key, keeps
 * the grouping `kind` and `entityType: 'admin-review'`, and each of the seven callers passes its own key.
 */

const h = vi.hoisted(() => ({ sent: [] as Record<string, unknown>[] }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: { user: { findMany: vi.fn(async () => [{ id: 'a1' }, { id: 'a2' }]) } },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    h.sent.push(input);
  }),
}));
vi.mock('@/lib/emoji/packs.server', () => ({ countPendingPacks: vi.fn() }));
vi.mock('@/lib/listings/listings.server', () => ({ countHeldCosmetics: vi.fn() }));

import { notifyAdminsOfReview } from '@/lib/admin-review.server';
import { notice } from '@/lib/notifications/notice-keys';

beforeEach(() => {
  h.sent = [];
});

describe('notifyAdminsOfReview', () => {
  it('sends every admin the notice, grouped by kind, with the default link', async () => {
    const n = notice('admin-review-report', { kind: 'rmhark' });
    await notifyAdminsOfReview({ notice: n });
    expect(h.sent).toHaveLength(2);
    for (const s of h.sent) {
      expect(s).toMatchObject({
        type: 'SYSTEM',
        entityType: 'admin-review',
        entityId: 'reports',
        link: '/admin/reports',
        dedupeUnread: true,
      });
      expect(s.preview).toBe(n);
    }
  });

  it('keeps an explicit kind and link', async () => {
    await notifyAdminsOfReview({ notice: notice('admin-review-appeal', {}), kind: 'appeals', link: '/admin/appeals' });
    expect(h.sent[0]).toMatchObject({ entityId: 'appeals', link: '/admin/appeals' });
  });
});

describe('the seven callers', () => {
  const callers: Array<[string, string]> = [
    ['lib/handles/impersonation.server.ts', "notice('admin-review-impersonation', {})"],
    ['lib/moderation/api/moderation.report.server.ts', "notice('admin-review-report', { kind: entityType })"],
    [
      'lib/moderation/auto-moderate.server.ts',
      "notice('admin-review-automod', { kind: args.entityType, category: verdict.category })",
    ],
    ['lib/account/api/account.strikes.$id.appeal.server.ts', "notice('admin-review-appeal', {})"],
    ['lib/creator/earnings.server.ts', "notice('admin-review-redemption', { kind: opts.input.kind, count: cost })"],
    ['lib/rmhmusic/learn/sprint/review.server.ts', "notice('admin-review-music-score', {})"],
    ['lib/listings/cosmetic.server.ts', "notice('admin-review-market', { count: result.price })"],
  ];
  it.each(callers)('%s passes its key', (file, call) => {
    const src = readFileSync(file, 'utf8');
    expect(src).toContain(call);
    expect(src).not.toMatch(/notifyAdminsOfReview\(\{\s*preview:/);
  });

  it('the fallbacks read as the English the callers used to pass', () => {
    expect(notice('admin-review-impersonation', {}).fallback).toBe('New impersonation report needs review');
    expect(notice('admin-review-report', { kind: 'comment' }).fallback).toBe('New comment report needs review');
    expect(notice('admin-review-automod', { kind: 'comment', category: 'SPAM' }).fallback).toBe(
      'Automated screening flagged a comment (SPAM)',
    );
    expect(notice('admin-review-appeal', {}).fallback).toBe('A user has appealed a moderation strike.');
    expect(notice('admin-review-redemption', { kind: 'SUB_CREDIT', count: 500 }).fallback).toBe(
      'New SUB_CREDIT redemption for 500 coins',
    );
    expect(notice('admin-review-market', { count: 9000 }).fallback).toBe(
      'Marketplace listing held for review: 9000 coins (≥10× median)',
    );
  });
});

/**
 * s14-17: a refused write carries the taxonomy code and `endsAt` for the reader's language, and keeps the old
 * `feature` / `until` fields for clients written before it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { ERROR_CODES } from '@/lib/errors/codes';
import { readRefusal } from '@/lib/errors/refusal';

const h = vi.hoisted(() => ({
  rows: [] as { feature: string; expiresAt: Date | null }[],
}));

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    featureRestriction: { findMany: vi.fn(async () => h.rows) },
  }),
}));
vi.mock('@/lib/cached.server', () => ({
  cached: (_k: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateCached: async () => undefined,
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: async () => undefined }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: async () => undefined }));

import { restrictionMessage, restrictionResponse } from '@/lib/moderation/restrictions.server';
import { clearRestrictionCache } from '@/lib/moderation/restrictions-core';

const END = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  h.rows = [];
  clearRestrictionCache();
});

describe('restrictionResponse', () => {
  it('a timed restriction answers 403 with the coded sentence, endsAt and the old fields', async () => {
    h.rows = [{ feature: 'comment', expiresAt: END }];
    const res = await restrictionResponse('u1', 'comment');
    expect(res?.status).toBe(403);
    const body = (await res!.json()) as Record<string, unknown>;
    assertJsonSafe(body);
    expect(body).toMatchObject({
      code: 'FEATURE_RESTRICTED_UNTIL',
      endsAt: END.toISOString(),
      feature: 'comment',
      until: END.toISOString(),
      error: `This is restricted on your account until ${END.toISOString()}. See Settings, Account status`,
    });
    // A current client reads the code and the date back; the English matches the code's own template.
    expect(readRefusal(body)).toEqual({ code: 'FEATURE_RESTRICTED_UNTIL', params: { endsAt: END.toISOString() } });
  });

  it('a permanent restriction answers the sentence without a date and `until: null`', async () => {
    h.rows = [{ feature: 'message', expiresAt: null }];
    const res = await restrictionResponse('u1', 'message');
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      code: 'FEATURE_RESTRICTED',
      feature: 'message',
      until: null,
      error: ERROR_CODES.FEATURE_RESTRICTED.text,
    });
    expect(body).not.toHaveProperty('endsAt');
    expect(readRefusal(body)).toEqual({ code: 'FEATURE_RESTRICTED', params: {} });
  });

  it('answers null for a feature the member is not timed out of', async () => {
    h.rows = [{ feature: 'post', expiresAt: END }];
    expect(await restrictionResponse('u1', 'comment')).toBeNull();
  });
});

describe('restrictionMessage (the developer API)', () => {
  it('is the same sentence, for the developer envelope', async () => {
    h.rows = [{ feature: 'post', expiresAt: END }];
    expect(await restrictionMessage('u1', 'post')).toBe(
      `This is restricted on your account until ${END.toISOString()}. See Settings, Account status`,
    );
    expect(await restrictionMessage('u1', 'comment')).toBeNull();
  });
});

describe('the codes', () => {
  it('are 403s with the sentences the brief names', () => {
    expect(ERROR_CODES.FEATURE_RESTRICTED).toMatchObject({
      http: 403,
      text: 'This is restricted on your account. See Settings, Account status',
    });
    expect(ERROR_CODES.FEATURE_RESTRICTED_UNTIL).toMatchObject({
      http: 403,
      text: 'This is restricted on your account until {{endsAt}}. See Settings, Account status',
    });
  });
});

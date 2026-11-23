import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A converted SYSTEM notice stores its key and params for the inbox and keeps the English sentence as `preview`, which
// push (live and held) carries; the string form every other caller uses is unchanged.

const createRow = vi.hoisted(() => vi.fn(async (_args: unknown) => ({ id: 'n1' })));
const updateRow = vi.hoisted(() => vi.fn(async (_args: unknown) => ({})));
const existing = vi.hoisted(() => ({ current: null as { id: string } | null }));
const sendPushToUser = vi.hoisted(() => vi.fn());
const holdNotification = vi.hoisted(() => vi.fn(async (_args: unknown) => {}));
const prefsRow = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    notificationPreference: { findUnique: vi.fn(async () => prefsRow.current) },
    notification: {
      findFirst: vi.fn(async () => existing.current),
      create: createRow,
      update: updateRow,
    },
  },
}));
vi.mock('@/lib/cached.server', () => ({
  cachedNullable: (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateCached: vi.fn(),
}));
vi.mock('@/lib/redis.server', () => ({
  redisEnabled: () => false,
  redisGetJSON: vi.fn(),
  redisSetJSON: vi.fn(),
  redisIncrBy: vi.fn(),
}));
vi.mock('@/lib/push/send.server', () => ({
  sendPushToUser,
  pushTitleFor: () => 'title',
  pushActionsFor: () => undefined,
}));
vi.mock('@/lib/notify/held.server', () => ({ holdNotification }));

const { createNotification } = await import('@/lib/notifications.server');
const { notice } = await import('@/lib/notifications/notice-keys');

const ENDS = new Date('2026-12-01T14:30:00.000Z');

// The quiet window used here (0 to 1439, end exclusive) leaves out the last minute of the UTC day, so a run during
// 23:59 UTC saw no quiet hours and failed. Pin the clock to midday so the result does not depend on when CI runs.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-22T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  prefsRow.current = null;
  existing.current = null;
  createRow.mockClear();
  updateRow.mockClear();
  sendPushToUser.mockClear();
  holdNotification.mockClear();
});

describe('createNotification with a key-based preview', () => {
  it('stores the key and params, and the English fallback as the preview', async () => {
    await createNotification({
      userId: 'u',
      type: 'SYSTEM',
      entityType: 'community_ban',
      preview: notice('community-timeout-until', { community: 'Chess', endsAt: ENDS }),
    });
    const data = (createRow.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({
      preview: 'You were timed out in Chess until 1 Dec 2026, 14:30 UTC',
      previewKey: 'community-timeout-until',
      previewParams: { community: 'Chess', endsAt: '2026-12-01T14:30:00.000Z' },
    });
  });

  it('sends the English fallback to push', async () => {
    await createNotification({
      userId: 'u',
      type: 'SYSTEM',
      preview: notice('community-timeout-until', { community: 'Chess', endsAt: ENDS }),
    });
    expect(sendPushToUser).toHaveBeenCalledWith(
      'u',
      expect.objectContaining({ body: 'You were timed out in Chess until 1 Dec 2026, 14:30 UTC' }),
    );
  });

  it('holds the English fallback for the morning push during quiet hours', async () => {
    prefsRow.current = {
      likes: true,
      comments: true,
      follows: true,
      mentions: true,
      reposts: true,
      system: true,
      matrix: {},
      quietStart: 0,
      quietEnd: 1439,
      tz: 'UTC',
    };
    await createNotification({ userId: 'u', type: 'SYSTEM', preview: notice('level-reached', { level: 7 }) });
    expect(holdNotification).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ body: 'You reached level 7!' }) }),
    );
  });

  it('keeps the string form exactly as it was: no key, no params', async () => {
    await createNotification({ userId: 'u', type: 'SYSTEM', preview: 'Plain English' });
    const data = (createRow.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.preview).toBe('Plain English');
    expect(data.previewKey).toBeNull();
    expect(data.previewParams).toBeUndefined();
    expect(sendPushToUser).toHaveBeenCalledWith('u', expect.objectContaining({ body: 'Plain English' }));
  });

  it('stores no preview at all when none is given', async () => {
    await createNotification({ userId: 'u', type: 'LIKE', actorId: 'a' });
    const data = (createRow.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.preview).toBeNull();
    expect(data.previewKey).toBeNull();
  });

  it('refreshes the key with the text when it folds into an unread notice', async () => {
    existing.current = { id: 'old' };
    await createNotification({
      userId: 'u',
      actorId: 'a',
      type: 'SYSTEM',
      dedupeUnread: true,
      preview: notice('level-reached', { level: 8 }),
    });
    expect(updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preview: 'You reached level 8!',
          previewKey: 'level-reached',
          previewParams: { level: 8 },
        }),
      }),
    );
  });

  it('clears the key when a plain-string preview folds into an unread keyed notice', async () => {
    existing.current = { id: 'old' };
    await createNotification({ userId: 'u', actorId: 'a', type: 'SYSTEM', dedupeUnread: true, preview: 'Plain text' });
    const data = (updateRow.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.preview).toBe('Plain text');
    expect(data.previewKey).toBeNull();
    expect(data).toHaveProperty('previewParams');
  });
});

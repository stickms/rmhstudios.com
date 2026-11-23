import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// createNotification() is the path almost every notifier takes (likes, follows, replies, tips…). The settings grid's
// Push column and quiet hours were read only by dispatch(), so for these they did nothing. These hold the rule:
// Push off is a plain drop, quiet hours hold the push for the morning flush, and an unmutable notice (a sign-in alert)
// is not held by the clock.

const prefsRow = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const sendPushToUser = vi.hoisted(() => vi.fn());
const holdNotification = vi.hoisted(() => vi.fn(async () => {}));
const createRow = vi.hoisted(() => vi.fn(async () => ({ id: 'n1' })));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    notificationPreference: { findUnique: vi.fn(async () => prefsRow.current) },
    notification: {
      findFirst: vi.fn(async () => null),
      create: createRow,
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

const ON = { likes: true, comments: true, follows: true, mentions: true, reposts: true, system: true };
const ALL_DAY = { quietStart: 0, quietEnd: 1439, tz: 'UTC' };

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
  sendPushToUser.mockClear();
  holdNotification.mockClear();
  createRow.mockClear();
});

describe('createNotification push decision', () => {
  it('pushes when the recipient has no preference row (defaults)', async () => {
    await createNotification({ userId: 'u', actorId: 'a', type: 'LIKE' });
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
  });

  it('does not push a like when Push is off for Likes & reposts', async () => {
    prefsRow.current = { ...ON, matrix: { social: { push: false } }, quietStart: null, quietEnd: null, tz: null };
    await createNotification({ userId: 'u', actorId: 'a', type: 'LIKE' });
    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(holdNotification).not.toHaveBeenCalled();
  });

  it('still pushes a follow when only Likes & reposts has Push off', async () => {
    prefsRow.current = { ...ON, matrix: { social: { push: false } }, quietStart: null, quietEnd: null, tz: null };
    await createNotification({ userId: 'u', actorId: 'a', type: 'FOLLOW' });
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
  });

  it('holds the push during quiet hours instead of sending it', async () => {
    prefsRow.current = { ...ON, matrix: {}, ...ALL_DAY };
    await createNotification({ userId: 'u', actorId: 'a', type: 'REPLY' });
    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(holdNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u', category: 'replies', channel: 'push' }),
    );
  });

  it('sends a sign-in alert during quiet hours (unmutable notices ignore the clock)', async () => {
    prefsRow.current = { ...ON, system: false, matrix: {}, ...ALL_DAY };
    await createNotification({ userId: 'u', type: 'SYSTEM', entityType: 'security', entityId: 's1' });
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(holdNotification).not.toHaveBeenCalled();
  });

  it('leaves the decision to the caller when skipPush is set (dispatch already applied the grid)', async () => {
    prefsRow.current = { ...ON, matrix: { social: { push: false } }, ...ALL_DAY };
    await createNotification({ userId: 'u', actorId: 'a', type: 'LIKE', skipPush: false });
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    await createNotification({ userId: 'u', actorId: 'a', type: 'LIKE', skipPush: true });
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
  });
});

describe('tips and awards follow the Tips & awards row', () => {
  it('a tip is not dropped when only System is off in-app', async () => {
    prefsRow.current = {
      ...ON,
      system: false,
      matrix: { system: { inapp: false } },
      quietStart: null,
      quietEnd: null,
      tz: null,
    };
    await createNotification({ userId: 'u', actorId: 'a', type: 'SYSTEM', category: 'economy', entityType: 'tip' });
    expect(createRow).toHaveBeenCalledTimes(1);
  });

  it('a tip is dropped when Tips & awards is off in-app', async () => {
    prefsRow.current = { ...ON, matrix: { economy: { inapp: false } }, quietStart: null, quietEnd: null, tz: null };
    await createNotification({ userId: 'u', actorId: 'a', type: 'SYSTEM', category: 'economy', entityType: 'tip' });
    expect(createRow).not.toHaveBeenCalled();
  });

  it('a tip is not pushed when Tips & awards has Push off', async () => {
    prefsRow.current = { ...ON, matrix: { economy: { push: false } }, quietStart: null, quietEnd: null, tz: null };
    await createNotification({ userId: 'u', actorId: 'a', type: 'SYSTEM', category: 'economy', entityType: 'tip' });
    expect(createRow).toHaveBeenCalledTimes(1);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The `messages` category: push on and in-app off by default, and the push-only branch carries the device tag. */

const h = vi.hoisted(() => ({
  prefs: null as null | Record<string, unknown>,
  sendPush: vi.fn(),
  hold: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: { notificationPreference: { findUnique: async () => h.prefs } },
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.create }));
vi.mock('@/lib/push/send.server', () => ({ sendPushToUser: h.sendPush, pushTitleFor: () => 'RMH Studios' }));
vi.mock('@/lib/notify/held.server', () => ({ holdNotification: h.hold }));

const { dispatch } = await import('@/lib/notify/dispatch.server');
const { CATEGORY_DEFAULTS, NOTIFY_CATEGORIES, resolveChannels } = await import('@/lib/notify/categories');
const { notifPrefsSchema } = await import('@/lib/notify/categories-schema');

beforeEach(() => {
  h.prefs = null;
  for (const f of [h.sendPush, h.hold, h.create]) f.mockReset();
});

describe('the messages category', () => {
  it('is a category, pushes by default and makes no inbox row or e-mail', () => {
    expect(NOTIFY_CATEGORIES).toContain('messages');
    expect(CATEGORY_DEFAULTS.messages).toEqual({ inapp: false, push: true, email: false });
    expect(resolveChannels({}, 'messages')).toEqual({ inapp: false, push: true, email: false });
    expect(notifPrefsSchema.safeParse({ matrix: { messages: { push: false } } }).success).toBe(true);
  });

  it('sends push-only with the tag the hold also uses', async () => {
    await dispatch({
      userId: 'ana',
      category: 'messages',
      type: 'SYSTEM',
      entityType: 'dm',
      entityId: 'dm1',
      preview: 'Sam sent you a message',
      link: '/messages/dm1',
    });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.sendPush).toHaveBeenCalledWith('ana', {
      title: 'RMH Studios',
      body: 'Sam sent you a message',
      url: '/messages/dm1',
      tag: 'dm:dm1',
    });
  });

  it('holds one push per conversation in quiet hours, keyed by the conversation', async () => {
    h.prefs = { matrix: {}, quietStart: 0, quietEnd: 1439, tz: 'UTC' };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-21T12:00:00Z'));
    for (let i = 0; i < 3; i++) {
      await dispatch({
        userId: 'ana',
        category: 'messages',
        type: 'SYSTEM',
        entityType: 'dm',
        entityId: 'dm1',
        preview: 'Sam sent you a message',
        link: '/messages/dm1',
      });
    }
    vi.useRealTimers();
    expect(h.sendPush).not.toHaveBeenCalled();
    const keys = h.hold.mock.calls.map((c) => (c[0] as { dedupeKey: string }).dedupeKey);
    expect(new Set(keys)).toEqual(new Set(['SYSTEM:dm:dm1']));
    expect(h.hold.mock.calls[0]![0].payload.tag).toBe('dm:dm1');
  });

  it('drops, not holds, when the member turned the push off', async () => {
    h.prefs = { matrix: { messages: { push: false } }, quietStart: 0, quietEnd: 1439, tz: 'UTC' };
    await dispatch({ userId: 'ana', category: 'messages', type: 'SYSTEM', entityType: 'dm', entityId: 'dm1' });
    expect(h.sendPush).not.toHaveBeenCalled();
    expect(h.hold).not.toHaveBeenCalled();
  });

  it('leaves an existing category push-only send as it was, plus the tag', async () => {
    h.prefs = { matrix: { social: { inapp: false } }, quietStart: null, quietEnd: null, tz: null };
    await dispatch({
      userId: 'ana',
      category: 'social',
      type: 'SYSTEM',
      entityType: 'post',
      entityId: 'p1',
      preview: 'Sam liked your post',
      link: '/p/p1',
    });
    expect(h.sendPush).toHaveBeenCalledWith('ana', {
      title: 'RMH Studios',
      body: 'Sam liked your post',
      url: '/p/p1',
      tag: 'post:p1',
    });
    // No entity, no tag: exactly the payload it had.
    h.sendPush.mockReset();
    await dispatch({ userId: 'ana', category: 'social', type: 'SYSTEM', preview: 'Hello' });
    expect(h.sendPush).toHaveBeenCalledWith('ana', { title: 'RMH Studios', body: 'Hello', url: '/notifications' });
  });
});

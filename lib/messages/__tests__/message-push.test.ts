import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A direct message pushes who it is from and never what it says. These run the real send, push and dispatch code with
 * Prisma, Redis and the push sender faked, so what the device would receive is what is asserted on.
 */

const MARKER = 'zq-marker-text-7f3a';
const ALT_MARKER = 'zq-marker-alt-91bc';

const h = vi.hoisted(() => ({
  dm: null as null | { participantOneId: string; participantTwoId: string; disappearAfterSec: number | null },
  gate: 'allowed' as 'allowed' | 'request',
  convPref: null as null | { muteUntil: Date | null; mentionsOnly: boolean; pinned: boolean },
  notifPrefs: null as null | Record<string, unknown>,
  failPush: false,
  sendPush: vi.fn(),
  hold: vi.fn(),
  createNotification: vi.fn(),
  openRequest: vi.fn(),
  redisCount: null as number | null,
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: {
      findUnique: async (a: { select?: { name?: boolean } }) =>
        a.select?.name ? { name: 'Sam', image: null, profile: null } : { profile: { dmPrivacy: 'EVERYONE' } },
    },
    userBlock: { findFirst: async () => null },
    follow: { findUnique: async () => ({ followerId: 'x' }) },
    chatMessage: { create: (a: unknown) => a },
    chat: { update: (a: unknown) => a },
    conversationPref: { findUnique: async () => h.convPref },
    notificationPreference: { findUnique: async () => h.notifPrefs },
    $transaction: async (ops: { data?: Record<string, unknown> }[]) => {
      const d = ops[0]!.data!;
      return [
        {
          id: 'm1',
          content: d.content,
          senderId: d.senderId,
          read: false,
          createdAt: new Date('2026-12-21T12:00:00Z'),
          gifUrl: null,
          gifAlt: null,
          imageUrls: d.imageUrls ?? [],
          imageAlts: d.imageAlts ?? [],
          expiresAt: null,
        },
      ];
    },
  },
}));
vi.mock('@/lib/chat/chat.server', () => ({
  findDm: async () => h.dm && { id: 'dm1', request: null, ...h.dm },
  findGroupMembership: async () => null,
}));
vi.mock('@/lib/messages/requests.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/messages/requests.server')>()),
  requestGate: async () =>
    h.gate === 'request' ? { outcome: 'request', privacy: 'FOLLOWERS' } : { outcome: 'allowed' },
  openRequest: h.openRequest,
  clearStaleDraft: async () => {},
}));
vi.mock('@/lib/messages/away.server', () => ({ afterDirectMessage: async () => {} }));
vi.mock('@/lib/moderation/restrictions.server', () => ({ restrictionResponse: async () => null }));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: async () => null }));
vi.mock('@/lib/rate-limit.server', () => ({ checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }) }));
vi.mock('@/lib/storage/keys', () => ({ ownsFeedImageUrl: () => true }));
vi.mock('@/lib/feed/alt-text.server', () => ({ altTextViolation: async () => null }));
vi.mock('@/lib/message-events', () => ({ notifyUser: vi.fn() }));
vi.mock('@/lib/group-events', () => ({ publishGroupMessage: vi.fn() }));
vi.mock('@/lib/chat-plus/unread.server', () => ({ adjustDmUnread: vi.fn() }));
vi.mock('@/lib/group-chat/serialize.server', () => ({
  groupMessageSelect: {},
  serializeGroupMessages: async () => [],
}));
vi.mock('@/lib/group-chat/mentions.server', () => ({ afterGroupMessage: async () => {} }));
vi.mock('@/lib/redis.server', () => ({ redisIncrBy: async () => h.redisCount }));
vi.mock('@/lib/push/send.server', () => ({
  sendPushToUser: (...args: unknown[]) => {
    if (h.failPush) throw new Error('push down');
    return h.sendPush(...args);
  },
  pushTitleFor: () => 'RMH Studios',
}));
vi.mock('@/lib/notify/held.server', () => ({ holdNotification: h.hold }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.createNotification }));

const { sendDirectMessage } = await import('@/lib/messages/send.server');
const { resetMessagePushWindows, MESSAGE_PUSH_WINDOW_MS } = await import('@/lib/messages/message-push.server');

const send = (content = 'hello', over: Partial<Parameters<typeof sendDirectMessage>[0]['input']> = {}) =>
  sendDirectMessage({ userId: 'sam', conversationId: 'dm1', input: { content, ...over }, pairRateLimit: false });

/** Let the fire-and-forget push finish. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-21T12:00:00Z'));
  h.dm = { participantOneId: 'sam', participantTwoId: 'ana', disappearAfterSec: null };
  h.gate = 'allowed';
  h.convPref = null;
  h.notifPrefs = null;
  h.failPush = false;
  h.redisCount = null;
  for (const f of [h.sendPush, h.hold, h.createNotification, h.openRequest]) f.mockReset();
  h.openRequest.mockResolvedValue({
    ok: true,
    value: { id: 'r1', content: 'hi', senderId: 'sam', createdAt: new Date(), expiresAt: null },
  });
  resetMessagePushWindows();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a direct message push', () => {
  it('sends one push to the recipient that says who and nothing else', async () => {
    const r = await send(MARKER, { imageUrls: ['img-sam-1'], imageAlts: [ALT_MARKER] });
    expect(r.ok).toBe(true);
    await settle();
    expect(h.sendPush).toHaveBeenCalledTimes(1);
    const [userId, payload] = h.sendPush.mock.calls[0]!;
    expect(userId).toBe('ana');
    expect(payload).toEqual({
      title: 'RMH Studios',
      body: 'Sam sent you a message',
      url: '/messages/dm1',
      tag: 'dm:dm1',
    });
    // Push-only: the Messages category has no inbox row.
    expect(h.createNotification).not.toHaveBeenCalled();
  });

  it('carries neither the text nor the picture description anywhere a device or the hold could read it', async () => {
    await send(MARKER, { imageUrls: ['img-sam-1'], imageAlts: [ALT_MARKER] });
    await settle();
    // Quiet hours all day: the same message, held for the morning flush instead.
    h.notifPrefs = { matrix: {}, quietStart: 0, quietEnd: 1439, tz: 'UTC' };
    resetMessagePushWindows();
    await send(MARKER, { imageUrls: ['img-sam-1'], imageAlts: [ALT_MARKER] });
    await settle();
    expect(h.hold).toHaveBeenCalledTimes(1);
    const seen = JSON.stringify([h.sendPush.mock.calls, h.hold.mock.calls]);
    expect(seen).not.toContain(MARKER);
    expect(seen).not.toContain(ALT_MARKER);
    expect(h.hold.mock.calls[0]![0]).toMatchObject({
      userId: 'ana',
      category: 'messages',
      payload: { body: 'Sam sent you a message', tag: 'dm:dm1' },
      dedupeKey: 'SYSTEM:dm:dm1',
    });
  });

  it('gives the dispatch call no text either', async () => {
    const dispatchSpy = vi.fn(async (_input: unknown) => {});
    vi.resetModules();
    vi.doMock('@/lib/notify/dispatch.server', () => ({ dispatch: dispatchSpy }));
    const { afterDirectMessagePush } = await import('@/lib/messages/message-push.server');
    await afterDirectMessagePush({ senderId: 'sam', recipientId: 'ana', conversationId: 'dm1' });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const input = JSON.stringify(dispatchSpy.mock.calls);
    expect(input).not.toContain(MARKER);
    expect(dispatchSpy.mock.calls[0]![0]).toMatchObject({
      userId: 'ana',
      category: 'messages',
      type: 'SYSTEM',
      entityType: 'dm',
      entityId: 'dm1',
      scopeKey: 'dm:dm1',
    });
    vi.doUnmock('@/lib/notify/dispatch.server');
  });

  it('sends nothing for Saved Messages', async () => {
    h.dm = { participantOneId: 'sam', participantTwoId: 'sam', disappearAfterSec: null };
    await send();
    await settle();
    expect(h.sendPush).not.toHaveBeenCalled();
  });

  it('sends nothing for a held message request', async () => {
    h.gate = 'request';
    const r = await sendDirectMessage({
      userId: 'sam',
      conversationId: 'dm1',
      input: { content: MARKER },
      pairRateLimit: false,
      allowRequest: true,
    });
    expect(r.ok).toBe(true);
    await settle();
    expect(h.openRequest).toHaveBeenCalled();
    expect(h.sendPush).not.toHaveBeenCalled();
    expect(h.hold).not.toHaveBeenCalled();
  });

  it('sends nothing for the away auto-reply, which is not written by sendDirectMessage', () => {
    const src = readFileSync(join(process.cwd(), 'lib/messages/away.server.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).toContain('postChatMessage(');
    expect(src).not.toMatch(/sendDirectMessage|afterDirectMessagePush|message-push/);
  });

  it('sends nothing while the conversation is muted, including after quiet hours would have held it', async () => {
    h.convPref = { muteUntil: new Date('2026-12-21T20:00:00Z'), mentionsOnly: false, pinned: false };
    await send();
    await settle();
    expect(h.sendPush).not.toHaveBeenCalled();
    h.notifPrefs = { matrix: {}, quietStart: 0, quietEnd: 1439, tz: 'UTC' };
    resetMessagePushWindows();
    await send();
    await settle();
    expect(h.hold).not.toHaveBeenCalled();
  });

  it('sends again once an eight-hour mute has ended', async () => {
    h.convPref = { muteUntil: new Date('2026-12-21T20:00:00Z'), mentionsOnly: false, pinned: false };
    vi.setSystemTime(new Date('2026-12-21T20:00:01Z'));
    await send();
    await settle();
    expect(h.sendPush).toHaveBeenCalledTimes(1);
  });

  it('does not spend the two-minute window on a muted message, so the first one after unmuting pushes', async () => {
    h.convPref = { muteUntil: new Date('2026-12-21T20:00:00Z'), mentionsOnly: false, pinned: false };
    await send();
    await settle();
    expect(h.sendPush).not.toHaveBeenCalled();
    h.convPref = null;
    await send('after');
    await settle();
    expect(h.sendPush).toHaveBeenCalledTimes(1);
  });

  it('is not silenced by a stray mentions-only setting, which a direct conversation does not offer', async () => {
    h.convPref = { muteUntil: null, mentionsOnly: true, pinned: false };
    await send();
    await settle();
    expect(h.sendPush).toHaveBeenCalledTimes(1);
  });

  it('stops when the member turned Messages push off', async () => {
    h.notifPrefs = { matrix: { messages: { push: false } }, quietStart: null, quietEnd: null, tz: null };
    await send();
    await settle();
    expect(h.sendPush).not.toHaveBeenCalled();
    expect(h.hold).not.toHaveBeenCalled();
  });

  it('makes one push for a burst, and another once the two minutes are over', async () => {
    for (let i = 0; i < 10; i++) await send(`m${i}`);
    await settle();
    expect(h.sendPush).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(Date.now() + MESSAGE_PUSH_WINDOW_MS + 1));
    await send('later');
    await settle();
    expect(h.sendPush).toHaveBeenCalledTimes(2);
  });

  it('coalesces on Redis when it is on', async () => {
    h.redisCount = 1;
    await send();
    await settle();
    h.redisCount = 2;
    await send();
    await settle();
    expect(h.sendPush).toHaveBeenCalledTimes(1);
  });

  it('pushes for a scheduled message, which is delivered through sendDirectMessage', () => {
    const src = readFileSync(join(process.cwd(), 'lib/messages/scheduled.server.ts'), 'utf8');
    expect(src).toMatch(/await sendDirectMessage\(/);
    const send = readFileSync(join(process.cwd(), 'lib/messages/send.server.ts'), 'utf8');
    expect(send).toMatch(/void afterDirectMessagePush\(/);
  });

  it('never fails the send when the push fails', async () => {
    h.failPush = true;
    const r = await send();
    await settle();
    expect(r.ok).toBe(true);
  });
});

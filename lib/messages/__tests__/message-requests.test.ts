import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Message requests (sprint 04 #16) against a fake database: the gate on every DM
 * write path, recipient-only decisions, the decline cooldown and the daily cap
 * under the per-sender lock.
 */

type Row = {
  senderId: string;
  recipientId: string;
  status: string;
  decidedAt: Date | null;
  chatId?: string;
  id?: string;
  createdAt?: Date;
};

const h = vi.hoisted(() => ({
  profile: { dmPrivacy: 'FOLLOWERS', dmRequests: true } as { dmPrivacy: string; dmRequests: boolean } | null,
  follows: false,
  request: null as null | {
    senderId: string;
    recipientId: string;
    status: string;
    decidedAt: Date | null;
  },
  history: false,
  recentCount: 0,
  dm: null as null | Record<string, unknown>,
  created: [] as Record<string, unknown>[],
  requestWrites: [] as { op: string; args: unknown }[],
  order: [] as string[],
  notifyUser: vi.fn(),
  adjust: vi.fn(),
  decideRow: null as null | { id: string; chatId: string; senderId: string },
  findFirstWhere: null as unknown,
  casCount: 1,
  updates: [] as unknown[],
}));

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    $executeRaw: async (_s: TemplateStringsArray, key: string) => {
      h.order.push(`lock:${key}`);
      return 1;
    },
    messageRequest: {
      findUnique: async () => h.request && { id: 'r1', ...h.request },
      count: async () => {
        h.order.push('count');
        return h.recentCount;
      },
      create: async (a: unknown) => {
        h.requestWrites.push({ op: 'create', args: a });
        return {};
      },
      update: async (a: unknown) => {
        h.requestWrites.push({ op: 'update', args: a });
        return {};
      },
      updateMany: async (a: unknown) => {
        h.updates.push(a);
        return { count: h.casCount };
      },
    },
    chatMessage: {
      findFirst: async () => (h.history ? { id: 'old' } : null),
      create: async (a: { data: Record<string, unknown> }) => {
        h.created.push(a.data);
        return {
          id: 'm1',
          content: a.data.content,
          senderId: a.data.senderId,
          createdAt: new Date('2026-11-24T10:00:00Z'),
          expiresAt: null,
        };
      },
      updateMany: async (a: unknown) => {
        h.updates.push(a);
        return { count: 1 };
      },
    },
    chat: { update: async () => ({}) },
    chatMember: { findFirst: async () => ({ userId: 'recipient' }) },
  };
  return {
    prisma: {
      ...tx,
      user: { findUnique: async () => (h.profile ? { profile: h.profile } : { profile: null }) },
      follow: { findUnique: async () => (h.follows ? { followerId: 'recipient' } : null) },
      userBlock: { findFirst: async () => null },
      messageRequest: {
        ...tx.messageRequest,
        findFirst: async (a: unknown) => {
          h.findFirstWhere = a;
          return h.decideRow ?? h.request;
        },
        count: async () => h.recentCount,
      },
      chatMessage: { ...tx.chatMessage, findFirst: async () => (h.history ? { id: 'old' } : null) },
      $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
    },
  };
});
vi.mock('@/lib/chat/chat.server', () => ({
  findDm: async () => h.dm,
  findGroupMembership: async () => null,
  dmKeyOf: (a: string, b: string) => `${a}:${b}`,
}));
vi.mock('@/lib/moderation/restrictions.server', () => ({ restrictionResponse: async () => null }));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: async () => null }));
vi.mock('@/lib/rate-limit.server', () => ({ checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }) }));
vi.mock('@/lib/storage/keys', () => ({ ownsFeedImageUrl: () => true }));
vi.mock('@/lib/message-events', () => ({ notifyUser: h.notifyUser }));
vi.mock('@/lib/group-events', () => ({ publishGroupMessage: vi.fn() }));
vi.mock('@/lib/chat-plus/unread.server', () => ({ adjustDmUnread: h.adjust }));
vi.mock('@/lib/chat-plus/post.server', () => ({ messageStamp: () => ({}) }));
vi.mock('@/lib/group-chat/serialize.server', () => ({
  groupMessageSelect: {},
  serializeGroupMessages: async () => [],
}));
vi.mock('@/lib/feed/alt-text.server', () => ({ altTextViolation: async () => null }));
vi.mock('@/lib/redis.server', () => ({ redisDel: async () => 1 }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => {}) }));

import { guardDirect, sendDirectMessage } from '@/lib/messages/send.server';
import { canDirectMessage } from '@/lib/chat-plus/dm-privacy.server';
import { decideRequest, openRequest, requestGate, requestWriteRefusal } from '@/lib/messages/requests.server';
import { createNotification } from '@/lib/notifications.server';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-24T12:00:00Z');
const dm = (request: Row | null = null) => ({
  id: 'chat1',
  participantOneId: 'recipient',
  participantTwoId: 'sender',
  disappearAfterSec: null,
  request,
});

beforeEach(() => {
  h.profile = { dmPrivacy: 'FOLLOWERS', dmRequests: true };
  h.follows = false;
  h.request = null;
  h.history = false;
  h.recentCount = 0;
  h.dm = dm();
  h.created = [];
  h.requestWrites = [];
  h.order = [];
  h.decideRow = null;
  h.casCount = 1;
  h.updates = [];
  h.notifyUser.mockClear();
  h.adjust.mockClear();
  vi.mocked(createNotification).mockClear();
});

describe('requestGate against the database', () => {
  it('is the privacy table when the switch is off, whatever else is true', async () => {
    h.profile = { dmPrivacy: 'FOLLOWERS', dmRequests: false };
    expect(await requestGate('sender', 'recipient')).toEqual({ outcome: 'refused', reason: 'FOLLOWERS' });
    h.profile = { dmPrivacy: 'NONE', dmRequests: false };
    expect(await requestGate('sender', 'recipient')).toEqual({ outcome: 'refused', reason: 'NONE' });
    h.profile = { dmPrivacy: 'EVERYONE', dmRequests: true };
    expect((await requestGate('sender', 'recipient')).outcome).toBe('allowed');
    h.profile = null;
    expect((await requestGate('sender', 'recipient')).outcome).toBe('allowed');
  });

  it('turns a refusal into a request only when the switch is on and the chat is new', async () => {
    expect(await requestGate('sender', 'recipient')).toEqual({ outcome: 'request', privacy: 'FOLLOWERS' });
    h.history = true;
    expect((await requestGate('sender', 'recipient')).outcome).toBe('refused');
    h.history = false;
    h.follows = true;
    expect((await requestGate('sender', 'recipient')).outcome).toBe('allowed');
  });

  it('honours the 30-day cooldown after a decline', async () => {
    const declined = (ago: number) => ({
      senderId: 'sender',
      recipientId: 'recipient',
      status: 'declined',
      decidedAt: new Date(NOW.getTime() - ago),
    });
    expect(await requestGate('sender', 'recipient', { now: NOW, request: declined(10 * DAY) })).toEqual({
      outcome: 'refused',
      reason: 'FOLLOWERS',
    });
    expect((await requestGate('sender', 'recipient', { now: NOW, request: declined(31 * DAY) })).outcome).toBe(
      'request',
    );
  });

  it('refuses a 21st request in a day', async () => {
    h.recentCount = 20;
    expect(await requestGate('sender', 'recipient')).toEqual({ outcome: 'refused', reason: 'cap' });
  });

  it('refuses a second message into a pending request and lets an accepted pair write', async () => {
    h.request = { senderId: 'sender', recipientId: 'recipient', status: 'pending', decidedAt: null };
    expect(await requestGate('sender', 'recipient')).toEqual({ outcome: 'refused', reason: 'pending' });
    h.request = { senderId: 'sender', recipientId: 'recipient', status: 'accepted', decidedAt: NOW };
    expect((await requestGate('sender', 'recipient')).outcome).toBe('allowed');
  });
});

describe('every DM write path applies the gate', () => {
  it('guardDirect passes a would-be request through with its decision, and turns a refusal away', async () => {
    const ok = await guardDirect('sender', 'chat1');
    expect(ok).toMatchObject({ ok: true, value: { gate: { outcome: 'request' } } });

    h.profile = { dmPrivacy: 'NONE', dmRequests: false };
    expect(await guardDirect('sender', 'chat1')).toMatchObject({ ok: false, code: 'cannot-message' });
  });

  it('guardDirect keeps a pending request out of its recipient’s hands', async () => {
    h.dm = dm({ senderId: 'sender', recipientId: 'recipient', status: 'pending', decidedAt: null });
    expect(await guardDirect('recipient', 'chat1')).toMatchObject({ ok: false, code: 'not-found' });
  });

  it('start/send: the first text becomes a request stored as read, with no push, unread or realtime event', async () => {
    const r = await sendDirectMessage({
      userId: 'sender',
      conversationId: 'chat1',
      input: { content: 'hello' },
      pairRateLimit: false,
      allowRequest: true,
    });
    expect(r.ok).toBe(true);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ content: 'hello', read: true });
    expect(h.requestWrites[0]).toMatchObject({ op: 'create' });
    expect(h.requestWrites[0]!.args).toMatchObject({
      data: { status: 'pending', senderId: 'sender', recipientId: 'recipient' },
    });
    expect(h.notifyUser).not.toHaveBeenCalled();
    expect(h.adjust).not.toHaveBeenCalled();
    if (r.ok) expect(r.value.message.read).toBe(false);
  });

  it('send: an image, a GIF or an empty message never travels in a request', async () => {
    const send = (input: Record<string, unknown>) =>
      sendDirectMessage({
        userId: 'sender',
        conversationId: 'chat1',
        input: { content: 'hi', ...input } as never,
        pairRateLimit: false,
        allowRequest: true,
      });
    expect(await send({ imageUrls: ['/sender-1.png'], imageAlts: [''] })).toMatchObject({
      ok: false,
      code: 'request-text-only',
    });
    expect(await send({ gifUrl: 'https://media.tenor.com/g.gif' })).toMatchObject({
      ok: false,
      code: 'request-text-only',
    });
    expect(await send({ content: ' ' })).toMatchObject({ ok: false, code: 'empty' });
    expect(h.created).toHaveLength(0);
  });

  it('send: a second message into a pending request is refused', async () => {
    h.request = { senderId: 'sender', recipientId: 'recipient', status: 'pending', decidedAt: null };
    h.dm = dm(h.request as Row);
    const r = await sendDirectMessage({
      userId: 'sender',
      conversationId: 'chat1',
      input: { content: 'again' },
      pairRateLimit: false,
      allowRequest: true,
    });
    expect(r).toMatchObject({ ok: false, code: 'cannot-message' });
    expect(h.created).toHaveLength(0);
  });

  it('scheduled delivery never opens a request', async () => {
    const r = await sendDirectMessage({
      userId: 'sender',
      conversationId: 'chat1',
      input: { content: 'later' },
      pairRateLimit: false,
    });
    expect(r).toMatchObject({ ok: false, code: 'cannot-message' });
    expect(h.created).toHaveLength(0);
  });

  it('forwards and other writes on the sender’s behalf are not allowed into a request', async () => {
    expect(await canDirectMessage('sender', 'recipient')).toBe(false);
    h.profile = { dmPrivacy: 'EVERYONE', dmRequests: true };
    expect(await canDirectMessage('sender', 'recipient')).toBe(true);
  });

  it('polls, checklists and slash commands are refused while the chat is only a request', async () => {
    expect(await requestWriteRefusal('sender', 'recipient', null)).toMatch(/only contain text/);
    expect(
      await requestWriteRefusal('sender', 'recipient', {
        senderId: 'sender',
        recipientId: 'recipient',
        status: 'pending',
        decidedAt: null,
      }),
    ).toMatch(/waiting/);
    h.profile = { dmPrivacy: 'NONE', dmRequests: false };
    expect(await requestWriteRefusal('sender', 'recipient', null)).toBeNull();
  });

  it('a declined sender inside the cooldown cannot post a poll or command into the chat either', async () => {
    const declined = {
      senderId: 'sender',
      recipientId: 'recipient',
      status: 'declined',
      decidedAt: new Date(Date.now() - DAY),
    };
    expect(await requestWriteRefusal('sender', 'recipient', declined)).toMatch(/waiting/);
    // A draft while the recipient takes requests is refused as "text only"; with requests off, as the waiting copy.
    expect(await requestWriteRefusal('sender', 'recipient', { ...declined, status: 'draft', decidedAt: null })).toMatch(
      /only contain text/,
    );
    h.profile = { dmPrivacy: 'NONE', dmRequests: false };
    expect(await requestWriteRefusal('sender', 'recipient', { ...declined, status: 'draft', decidedAt: null })).toMatch(
      /waiting/,
    );
  });
});

describe('opening a request', () => {
  it('takes the per-sender lock before it counts, and refuses the 21st', async () => {
    h.recentCount = 20;
    const r = await openRequest({
      senderId: 'sender',
      chatId: 'chat1',
      privacy: 'FOLLOWERS',
      message: async () => 'x',
    });
    expect(r).toEqual({ ok: false, reason: 'cap' });
    expect(h.order[0]).toBe('lock:dm-request:sender');
    expect(h.order.indexOf('count')).toBeGreaterThan(0);
    expect(h.requestWrites).toHaveLength(0);
  });

  it('a draft (no message) needs no cap room and writes no message', async () => {
    h.recentCount = 20;
    const r = await openRequest({ senderId: 'sender', chatId: 'chat1', privacy: 'FOLLOWERS' });
    expect(r).toEqual({ ok: true, value: null });
    expect(h.requestWrites[0]!.args).toMatchObject({ data: { status: 'draft' } });
  });

  it('resets a declined request past its cooldown to pending, and refuses inside it', async () => {
    h.request = {
      senderId: 'sender',
      recipientId: 'recipient',
      status: 'declined',
      decidedAt: new Date(Date.now() - 31 * DAY),
    };
    const ok = await openRequest({ senderId: 'sender', chatId: 'chat1', privacy: 'NONE', message: async () => 1 });
    expect(ok).toEqual({ ok: true, value: 1 });
    expect(h.requestWrites[0]).toMatchObject({ op: 'update' });
    expect(h.requestWrites[0]!.args).toMatchObject({ data: { status: 'pending', decidedAt: null } });

    h.requestWrites = [];
    h.request = {
      senderId: 'sender',
      recipientId: 'recipient',
      status: 'declined',
      decidedAt: new Date(Date.now() - DAY),
    };
    expect(await openRequest({ senderId: 'sender', chatId: 'chat1', privacy: 'NONE', message: async () => 1 })).toEqual(
      {
        ok: false,
        reason: 'NONE',
      },
    );
    expect(h.requestWrites).toHaveLength(0);
  });

  it('refuses a second request on a chat whose request is pending', async () => {
    h.request = { senderId: 'sender', recipientId: 'recipient', status: 'pending', decidedAt: null };
    expect(await openRequest({ senderId: 'sender', chatId: 'chat1', privacy: 'NONE', message: async () => 1 })).toEqual(
      {
        ok: false,
        reason: 'pending',
      },
    );
  });
});

describe('answering a request', () => {
  it('finds a request only for its recipient, so a sender or stranger gets "not found"', async () => {
    h.decideRow = null;
    expect(await decideRequest({ recipientId: 'stranger', requestId: 'r1', action: 'accept' })).toEqual({
      ok: false,
      status: 404,
    });
    expect(h.findFirstWhere).toEqual({
      where: { id: 'r1', recipientId: 'stranger', status: 'pending' },
      select: { id: true, chatId: true, senderId: true },
    });
    expect(h.updates).toHaveLength(0);
  });

  it('accept: compare-and-set, turns the message unread, tells the sender', async () => {
    h.decideRow = { id: 'r1', chatId: 'chat1', senderId: 'sender' };
    const r = await decideRequest({ recipientId: 'recipient', requestId: 'r1', action: 'accept', now: NOW });
    expect(r).toEqual({ ok: true, conversationId: 'chat1', senderId: 'sender' });
    expect(h.updates[0]).toEqual({
      where: { id: 'r1', recipientId: 'recipient', status: 'pending' },
      data: { status: 'accepted', decidedAt: NOW },
    });
    expect(h.updates[1]).toMatchObject({ data: { read: false } });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'sender', actorId: 'recipient' }),
    );
  });

  it('decline: records the time, notifies nobody', async () => {
    h.decideRow = { id: 'r1', chatId: 'chat1', senderId: 'sender' };
    const r = await decideRequest({ recipientId: 'recipient', requestId: 'r1', action: 'decline', now: NOW });
    expect(r.ok).toBe(true);
    expect(h.updates[0]).toMatchObject({ data: { status: 'declined', decidedAt: NOW } });
    expect(h.updates).toHaveLength(1);
    expect(createNotification).not.toHaveBeenCalled();
    expect(h.notifyUser).not.toHaveBeenCalled();
  });

  it('a lost race (already answered) is "not found" and changes nothing else', async () => {
    h.decideRow = { id: 'r1', chatId: 'chat1', senderId: 'sender' };
    h.casCount = 0;
    expect(await decideRequest({ recipientId: 'recipient', requestId: 'r1', action: 'accept' })).toEqual({
      ok: false,
      status: 404,
    });
    expect(h.updates).toHaveLength(1);
    expect(createNotification).not.toHaveBeenCalled();
  });
});

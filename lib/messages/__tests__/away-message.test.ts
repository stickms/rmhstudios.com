import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Away messages (sprint 06 #18) against a fake database: one reply per conversation per period (even for two
 * concurrent messages), never into a request, a blocked or muted pair or an automatic message, nothing outside the
 * window, and a status endpoint that never shows the text.
 */

const NOW = new Date('2026-12-01T12:00:00Z');
const DAY = 86_400_000;

type Away = {
  id: string;
  userId: string;
  body: string;
  startsAt: Date;
  endsAt: Date;
  tz: string;
  showOnProfile: boolean;
};

const h = vi.hoisted(() => ({
  away: null as unknown,
  chat: { id: 'chat1', messageRequest: null } as null | { id: string; messageRequest: null | { status: string } },
  blocked: false,
  muted: false,
  canDm: true,
  claims: new Set<string>(),
  posted: [] as unknown[],
  dm: null as unknown,
  updates: [] as unknown[],
  created: [] as unknown[],
  existing: null as unknown,
  postFails: false,
  sender: { isBot: false, bannedUntil: null } as null | { isBot: boolean; bannedUntil: Date | null },
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    awayMessage: {
      findUnique: async () => h.away ?? h.existing,
      update: async (a: { data: Record<string, unknown> }) => {
        h.updates.push(a);
        return { ...(h.existing as object), ...a.data };
      },
      deleteMany: async () => ({ count: 1 }),
      create: async (a: { data: Record<string, unknown> }) => {
        h.created.push(a);
        return { id: 'new-id', createdAt: NOW, ...a.data };
      },
    },
    awayReplySent: {
      createMany: async (a: { data: { awayId: string; chatId: string }[] }) => {
        const k = `${a.data[0]!.awayId}:${a.data[0]!.chatId}`;
        if (h.claims.has(k)) return { count: 0 };
        h.claims.add(k);
        return { count: 1 };
      },
      deleteMany: async (a: { where: { awayId: string; chatId: string } }) => {
        h.claims.delete(`${a.where.awayId}:${a.where.chatId}`);
        return { count: 1 };
      },
      findMany: async () => [],
    },
    user: { findUnique: async () => h.sender },
    chat: { findFirst: async () => h.chat },
    userBlock: { findFirst: async () => (h.blocked ? { id: 'b' } : null) },
    userMute: { findFirst: async () => (h.muted ? { id: 'm' } : null) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
vi.mock('@/lib/chat-plus/dm-privacy.server', () => ({ canDirectMessage: async () => h.canDm }));
vi.mock('@/lib/chat-plus/access.server', () => ({ getChatAccess: async () => ({ kind: 'dm', id: 'chat1' }) }));
vi.mock('@/lib/chat-plus/post.server', () => ({
  postChatMessage: async (_a: unknown, input: unknown) => {
    if (h.postFails) throw new Error('boom');
    h.posted.push(input);
    return { kind: 'dm', message: { id: `msg${h.posted.length}` } };
  },
}));
vi.mock('@/lib/chat/chat.server', () => ({
  dmKeyOf: (a: string, b: string) => `${a}:${b}`,
  findDmByPair: async () => h.dm,
}));

import { afterDirectMessage, awayStatusFor, setAway } from '@/lib/messages/away.server';
import { putAwayBody } from '@/lib/messages/away-schema';

function active(over: Partial<Away> = {}): Away {
  return {
    id: 'away1',
    userId: 'away-user',
    body: 'Back on Friday',
    startsAt: new Date(NOW.getTime() - DAY),
    endsAt: new Date(NOW.getTime() + 3 * DAY),
    tz: 'UTC',
    showOnProfile: false,
    ...over,
  };
}

const send = (meta?: unknown) =>
  afterDirectMessage({ senderId: 'sender', recipientId: 'away-user', chatId: 'chat1', meta, now: NOW });

beforeEach(() => {
  h.away = active();
  h.chat = { id: 'chat1', messageRequest: null };
  h.blocked = false;
  h.muted = false;
  h.canDm = true;
  h.sender = { isBot: false, bannedUntil: null };
  h.claims.clear();
  h.posted.length = 0;
  h.dm = { id: 'chat1', request: null };
  h.updates.length = 0;
  h.created.length = 0;
  h.existing = null;
  h.postFails = false;
});

describe('afterDirectMessage', () => {
  it('sends one labelled reply from the away member, with their own text', async () => {
    const r = await send();
    expect(r.sent).toBe(true);
    expect(h.posted).toEqual([
      { senderId: 'away-user', content: 'Back on Friday', kind: 'text', meta: { autoReply: 'away', awayId: 'away1' } },
    ]);
  });

  it('sends one reply for two concurrent messages and none for later ones in the same period', async () => {
    const results = await Promise.all([send(), send()]);
    expect(results.filter((r) => r.sent)).toHaveLength(1);
    await send();
    expect(h.posted).toHaveLength(1);
  });

  it('answers again in a new period (new id)', async () => {
    await send();
    h.away = active({ id: 'away2' });
    await send();
    expect(h.posted).toHaveLength(2);
  });

  it('gives the claim back when the reply could not be posted, so a later message retries', async () => {
    h.postFails = true;
    expect(await send()).toEqual({ sent: false, reason: 'failed' });
    h.postFails = false;
    expect((await send()).sent).toBe(true);
  });

  it.each(['pending', 'draft', 'declined'])('never replies into a %s message request', async (status) => {
    h.chat = { id: 'chat1', messageRequest: { status } };
    expect(await send()).toEqual({ sent: false, reason: 'not-accepted' });
    expect(h.posted).toHaveLength(0);
    expect(h.claims.size).toBe(0);
  });

  it('replies in an accepted request conversation', async () => {
    h.chat = { id: 'chat1', messageRequest: { status: 'accepted' } };
    expect((await send()).sent).toBe(true);
  });

  it('never replies to a blocked pair or a muted pair', async () => {
    h.blocked = true;
    expect(await send()).toEqual({ sent: false, reason: 'closed' });
    h.blocked = false;
    h.muted = true;
    expect(await send()).toEqual({ sent: false, reason: 'closed' });
    expect(h.posted).toHaveLength(0);
  });

  it('never replies to a bot or a banned sender', async () => {
    h.sender = { isBot: true, bannedUntil: null };
    expect(await send()).toEqual({ sent: false, reason: 'sender-excluded' });
    h.sender = { isBot: false, bannedUntil: new Date(NOW.getTime() + DAY) };
    expect(await send()).toEqual({ sent: false, reason: 'sender-excluded' });
    h.sender = { isBot: false, bannedUntil: new Date(NOW.getTime() - DAY) };
    expect((await send()).sent).toBe(true);
  });

  it('never replies past DM privacy', async () => {
    h.canDm = false;
    expect(await send()).toEqual({ sent: false, reason: 'dm-privacy' });
  });

  it('never replies to an automatic message (no loops between two away members)', async () => {
    expect(await send({ autoReply: 'away' })).toEqual({ sent: false, reason: 'automatic' });
    expect(await send({ autoReply: true })).toEqual({ sent: false, reason: 'automatic' });
    expect(h.posted).toHaveLength(0);
  });

  it('sends nothing once ended, nor before it starts, nor with no away message', async () => {
    h.away = active({ endsAt: new Date(NOW.getTime() - 1) });
    expect((await send()).sent).toBe(false);
    h.away = active({ startsAt: new Date(NOW.getTime() + DAY) });
    expect((await send()).sent).toBe(false);
    h.away = null;
    expect(await send()).toEqual({ sent: false, reason: 'not-away' });
    expect(h.posted).toHaveLength(0);
  });

  it('never throws', async () => {
    h.chat = undefined as never;
    h.away = { ...active(), startsAt: 'garbage' };
    await expect(send()).resolves.toMatchObject({ sent: false });
  });
});

describe('setAway', () => {
  const input = { body: 'Away', endDay: '2026-12-05', tz: 'UTC', showOnProfile: false };
  beforeEach(() => {
    h.away = null;
  });

  it('refuses an end more than 60 days ahead', async () => {
    expect(await setAway('u', { ...input, endDay: '2027-03-01' }, NOW)).toEqual({ ok: false, code: 'too-far' });
    expect(h.created).toHaveLength(0);
  });

  it('refuses an end in the past', async () => {
    expect(await setAway('u', { ...input, endDay: '2026-11-30' }, NOW)).toEqual({ ok: false, code: 'ended' });
  });

  it('keeps the id (and the start) when editing an active message', async () => {
    h.existing = active({ userId: 'u' });
    const r = await setAway('u', { ...input, body: 'New text' }, NOW);
    expect(r.ok && r.away.id).toBe('away1');
    expect(h.updates).toHaveLength(1);
    expect(h.created).toHaveLength(0);
    const data = (h.updates[0] as { data: { startsAt: Date } }).data;
    expect(data.startsAt).toEqual((h.existing as Away).startsAt);
  });

  it('makes a new id after the last one ended', async () => {
    h.existing = active({ userId: 'u', endsAt: new Date(NOW.getTime() - DAY) });
    const r = await setAway('u', input, NOW);
    expect(r.ok && r.away.id).toBe('new-id');
    expect(h.created).toHaveLength(1);
  });
});

describe('awayStatusFor', () => {
  it('returns the end only, never the text', async () => {
    const s = await awayStatusFor('viewer', 'away-user', 'header', NOW);
    expect(s.active).toBe(true);
    expect(JSON.stringify(s)).not.toContain('Back on Friday');
    expect(Object.keys(s).sort()).toEqual(['active', 'endsAt', 'tz']);
  });

  it('returns nothing to someone who cannot message the member', async () => {
    h.canDm = false;
    expect(await awayStatusFor('viewer', 'away-user', 'header', NOW)).toEqual({
      active: false,
      endsAt: null,
      tz: null,
    });
  });

  it('returns nothing across a block or a mute', async () => {
    h.blocked = true;
    expect((await awayStatusFor('viewer', 'away-user', 'header', NOW)).active).toBe(false);
    h.blocked = false;
    h.muted = true;
    expect((await awayStatusFor('viewer', 'away-user', 'header', NOW)).active).toBe(false);
  });

  it('shows the profile line only when the member opted in', async () => {
    expect((await awayStatusFor('viewer', 'away-user', 'profile', NOW)).active).toBe(false);
    h.away = active({ showOnProfile: true });
    expect((await awayStatusFor('viewer', 'away-user', 'profile', NOW)).active).toBe(true);
  });

  it('needs an accepted conversation for the header', async () => {
    h.dm = null;
    expect((await awayStatusFor('viewer', 'away-user', 'header', NOW)).active).toBe(false);
    h.dm = { id: 'chat1', request: { status: 'pending' } };
    expect((await awayStatusFor('viewer', 'away-user', 'header', NOW)).active).toBe(false);
  });

  it('is empty before the window, after it, and for the member themself', async () => {
    h.away = active({ endsAt: new Date(NOW.getTime() - 1) });
    expect((await awayStatusFor('viewer', 'away-user', 'header', NOW)).active).toBe(false);
    h.away = active();
    expect((await awayStatusFor('away-user', 'away-user', 'header', NOW)).active).toBe(false);
  });
});

describe('putAwayBody', () => {
  const ok = { body: 'Hi', endDay: '2026-12-05', tz: 'Europe/Berlin' };
  it('accepts a valid body and defaults the profile line off', () => {
    expect(putAwayBody.parse(ok).showOnProfile).toBe(false);
  });
  it('refuses text over 300 characters, empty text, a bad day and a bad zone', () => {
    expect(putAwayBody.safeParse({ ...ok, body: 'x'.repeat(301) }).success).toBe(false);
    expect(putAwayBody.safeParse({ ...ok, body: '   ' }).success).toBe(false);
    expect(putAwayBody.safeParse({ ...ok, endDay: 'Friday' }).success).toBe(false);
    expect(putAwayBody.safeParse({ ...ok, tz: 'Mars/Base' }).success).toBe(false);
  });
});

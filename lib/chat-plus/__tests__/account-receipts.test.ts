/**
 * Sprint 06 #17: the account-wide receipt and typing switches fold into the pair rule, so every existing
 * caller honours them. Prisma is a small in-memory fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const db = vi.hoisted(() => ({
  viewer: 'a' as string,
  profiles: new Map<
    string,
    {
      readReceipts: boolean;
      typingIndicators: boolean;
    }
  >(),
  prefs: [] as {
    userId: string;
    scopeKey: string;
    hideReceipts: boolean;
    hideTyping: boolean;
  }[],
  upserts: [] as unknown[],
  prefWrites: 0,
  lastMessage: {
    id: 'm1',
    content: 'hello',
    senderId: 'a',
    read: true,
    createdAt: new Date(),
    gifUrl: null,
    imageUrls: [],
  },
}));

const inList = (v: unknown, id: string) =>
  Array.isArray(
    (
      v as {
        in?: string[];
      }
    )?.in,
  ) &&
  (
    v as {
      in: string[];
    }
  ).in.includes(id);

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: {
          id: db.viewer,
        },
        session: {},
      }),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({
  withRateLimitAsync: async () => null,
  checkRateLimit: async () => ({
    allowed: true,
    retryAfter: 0,
  }),
}));
vi.mock('@/lib/moderation/restrictions.server', () => ({
  restrictionResponse: async () => null,
}));
vi.mock('@/lib/admin-audit.server', () => ({
  getActiveBan: async () => null,
}));
vi.mock('@/lib/chat/chat.server', () => ({
  dmChatSelect: {},
  dmKeyOf: () => 'k',
  dmsOf: () => ({}),
  inboxVisibleTo: () => ({}),
  toDmRow: (c: { id: string }) => ({
    id: c.id,
    participantOneId: 'a',
    participantTwoId: 'b',
    request: null,
    lastMessageAt: new Date(),
  }),
}));
vi.mock('@/lib/chat-plus/expiry.server', () => ({
  liveMessages: () => ({}),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    conversationPref: {
      findMany: async ({
        where,
      }: {
        where: {
          userId: unknown;
          scopeKey: unknown;
          hideReceipts?: boolean;
        };
      }) =>
        db.prefs.filter((p) => {
          const scope = where.scopeKey as
            | string
            | {
                in: string[];
              };
          const okScope = typeof scope === 'string' ? p.scopeKey === scope : scope.in.includes(p.scopeKey);
          return (
            okScope &&
            inList(where.userId, p.userId) &&
            (where.hideReceipts === undefined || p.hideReceipts === where.hideReceipts)
          );
        }),
      findUnique: async () => null,
      upsert: async () => {
        db.prefWrites++;
        return {};
      },
    },
    userProfile: {
      findMany: async ({
        where,
      }: {
        where: {
          userId: unknown;
          readReceipts?: boolean;
        };
      }) =>
        [...db.profiles]
          .filter(
            ([id, p]) =>
              inList(where.userId, id) && (where.readReceipts === undefined || p.readReceipts === where.readReceipts),
          )
          .map(([userId, p]) => ({
            userId,
            ...p,
          })),
      findUnique: async ({
        where,
      }: {
        where: {
          userId: string;
        };
      }) => db.profiles.get(where.userId) ?? null,
      upsert: async (args: {
        where: {
          userId: string;
        };
        update: object;
        create: object;
      }) => {
        db.upserts.push(args);
        const cur = db.profiles.get(args.where.userId) ?? {
          readReceipts: true,
          typingIndicators: true,
        };
        const next = {
          ...cur,
          ...args.update,
        };
        db.profiles.set(args.where.userId, next);
        return next;
      },
    },
    chat: {
      findMany: async () => [
        {
          id: 'c1',
          members: [
            {
              userId: 'a',
              slot: 0,
              user: {
                id: 'a',
                name: 'A',
                image: null,
                username: null,
                isBot: false,
                profile: null,
              },
            },
            {
              userId: 'b',
              slot: 1,
              user: {
                id: 'b',
                name: 'B',
                image: null,
                username: null,
                isBot: false,
                profile: null,
              },
            },
          ],
          messages: [db.lastMessage],
        },
      ],
    },
    $queryRaw: async () => [],
  },
}));

import { getPairPrivacy, receiptsHiddenFor, getAccountReceiptPrefs } from '@/lib/chat-plus/receipts.server';
import { route as searchRoute } from '@/lib/messages/api/messages.search.server';
import { route as settingsRoute } from '@/lib/messages/api/settings.read-receipts.server';

const conv = {
  id: 'c1',
  participantOneId: 'a',
  participantTwoId: 'b',
};

beforeEach(() => {
  db.viewer = 'a';
  db.profiles.clear();
  db.prefs = [];
  db.upserts = [];
  db.prefWrites = 0;
});

describe('account-wide receipts fold into the pair rule', () => {
  it('shows both signals when nobody has anything off', async () => {
    expect(await getPairPrivacy('c1', ['a', 'b'])).toEqual({
      receiptsHidden: false,
      typingHidden: false,
    });
    expect((await receiptsHiddenFor([conv])).size).toBe(0);
  });

  it.each(['a', 'b'])('hides both ways when participant %s has the account switch off', async (who) => {
    db.profiles.set(who, {
      readReceipts: false,
      typingIndicators: false,
    });
    expect(await getPairPrivacy('c1', ['a', 'b'])).toEqual({
      receiptsHidden: true,
      typingHidden: true,
    });
    expect((await receiptsHiddenFor([conv])).has('c1')).toBe(true);
  });

  it('keeps receipts and typing independent', async () => {
    db.profiles.set('b', {
      readReceipts: true,
      typingIndicators: false,
    });
    expect(await getPairPrivacy('c1', ['a', 'b'])).toEqual({
      receiptsHidden: false,
      typingHidden: true,
    });
  });

  it('still honours the per-conversation switch when the account switches are on', async () => {
    db.prefs.push({
      userId: 'b',
      scopeKey: 'dm:c1',
      hideReceipts: true,
      hideTyping: false,
    });
    expect(await getPairPrivacy('c1', ['a', 'b'])).toEqual({
      receiptsHidden: true,
      typingHidden: false,
    });
  });

  it('restores the conversation own value when the account switch is turned back on', async () => {
    db.prefs.push({
      userId: 'a',
      scopeKey: 'dm:c1',
      hideReceipts: false,
      hideTyping: false,
    });
    db.profiles.set('a', {
      readReceipts: false,
      typingIndicators: true,
    });
    expect((await getPairPrivacy('c1', ['a', 'b'])).receiptsHidden).toBe(true);
    db.profiles.set('a', {
      readReceipts: true,
      typingIndicators: true,
    });
    expect((await getPairPrivacy('c1', ['a', 'b'])).receiptsHidden).toBe(false);
    expect(db.prefs[0]?.hideReceipts).toBe(false);
  });

  it('never hides Saved Messages (a chat with yourself)', async () => {
    db.profiles.set('a', {
      readReceipts: false,
      typingIndicators: false,
    });
    expect(await getPairPrivacy('s', ['a', 'a'])).toEqual({
      receiptsHidden: false,
      typingHidden: false,
    });
    expect(
      (
        await receiptsHiddenFor([
          {
            id: 's',
            participantOneId: 'a',
            participantTwoId: 'a',
          },
        ])
      ).size,
    ).toBe(0);
  });

  it('defaults to on for a member with no profile row', async () => {
    expect(await getAccountReceiptPrefs('nobody')).toEqual({
      readReceipts: true,
      typingIndicators: true,
    });
  });
});

describe('message search no longer reveals "read"', () => {
  const search = async () => {
    const res = await handlersOf(searchRoute).GET!({
      request: new Request('http://x/api/messages/search?q=hello', {
        headers: {
          cookie: 'better-auth.session_token=t',
        },
      }),
      params: {},
    });
    const body = (await res.json()) as {
      conversations: {
        lastMessage: {
          read: boolean;
        };
      }[];
    };
    return body.conversations[0]?.lastMessage.read;
  };

  it('reports read when receipts are on', async () => {
    expect(await search()).toBe(true);
  });

  it.each(['a', 'b'])('reports unread when participant %s has the account switch off', async (who) => {
    db.profiles.set(who, {
      readReceipts: false,
      typingIndicators: true,
    });
    expect(await search()).toBe(false);
  });

  it('reports unread when the conversation switch is off', async () => {
    db.prefs.push({
      userId: 'b',
      scopeKey: 'dm:c1',
      hideReceipts: true,
      hideTyping: false,
    });
    expect(await search()).toBe(false);
  });

  it('leaves the stored flag alone: the recipient still sees their message as read', async () => {
    db.profiles.set('a', {
      readReceipts: false,
      typingIndicators: true,
    });
    await search();
    expect(db.lastMessage.read).toBe(true);
  });
});

describe('PUT /api/settings/read-receipts', () => {
  const put = (body: unknown) =>
    handlersOf(settingsRoute).PUT!({
      request: new Request('http://x/api/settings/read-receipts', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: 'better-auth.session_token=t',
        },
        body: JSON.stringify(body),
      }),
      params: {},
    });

  it('saves on the profile row only and never writes conversation preferences', async () => {
    const res = await put({
      readReceipts: false,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      readReceipts: false,
      typingIndicators: true,
    });
    expect(db.prefWrites).toBe(0);
  });

  it('rejects an empty or non-boolean body', async () => {
    expect((await put({})).status).toBe(400);
    expect(
      (
        await put({
          readReceipts: 'no',
        })
      ).status,
    ).toBe(400);
  });
});

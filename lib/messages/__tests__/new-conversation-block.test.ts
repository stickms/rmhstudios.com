/**
 * `POST /api/messages` starts (or continues) a conversation. A block in either
 * direction refuses it with the same 403 the send path answers, before any
 * conversation row is created.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  blocks: [] as {
    blockerId: string;
    blockedId: string;
  }[],
  upsertDm: vi.fn(async () => ({
    id: 'dm1',
    disappearAfterSec: null,
  })),
  create: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: {
      findUnique: async () => ({
        id: 'ana',
        profile: {
          dmPrivacy: 'EVERYONE',
        },
      }),
    },
    userBlock: {
      findFirst: async (a: {
        where: {
          OR: {
            blockerId: string;
            blockedId: string;
          }[];
        };
      }) =>
        h.blocks.some((b) => a.where.OR.some((c) => c.blockerId === b.blockerId && c.blockedId === b.blockedId))
          ? {
              id: 'b1',
            }
          : null,
    },
    chatMessage: {
      create: (a: unknown) => a,
    },
    chat: {
      update: (a: unknown) => a,
    },
    $transaction: async (
      ops: {
        data: Record<string, unknown>;
      }[],
    ) => {
      h.create(ops[0]);
      return [
        {
          id: 'm1',
          content: ops[0]!.data.content,
          senderId: ops[0]!.data.senderId,
          read: false,
          createdAt: new Date('2026-11-23T09:00:00Z'),
          gifUrl: null,
          imageUrls: [],
          expiresAt: null,
        },
      ];
    },
  },
}));
vi.mock('@/lib/chat/chat.server', () => ({
  upsertDm: h.upsertDm,
  findDmByPair: async () => null,
}));
vi.mock('@/lib/moderation/restrictions.server', () => ({
  restrictionResponse: async () => null,
}));
vi.mock('@/lib/message-events', () => ({
  notifyUser: vi.fn(),
}));
vi.mock('@/lib/chat-plus/unread.server', () => ({
  adjustDmUnread: vi.fn(),
}));
vi.mock('@/lib/chat-plus/post.server', () => ({
  messageStamp: () => ({}),
}));
vi.mock('@/lib/storage/keys', async (orig) => ({
  ...(await orig<object>()),
  ownsFeedImageUrl: () => true,
}));
vi.mock('@/lib/messages.server', () => ({
  listConversations: vi.fn(),
}));
vi.mock('@/lib/messages/send.server', async () => {
  const { prisma } = await import('@/lib/prisma.server');
  return {
    guardImageAlts: async () => null,
    isBlockedPair: async (a: string, b: string) =>
      !!(await prisma.userBlock.findFirst({
        where: {
          OR: [
            {
              blockerId: a,
              blockedId: b,
            },
            {
              blockerId: b,
              blockedId: a,
            },
          ],
        },
      } as never)),
  };
});
vi.mock('@/lib/api/implement.server', () => ({
  implement: (_c: unknown, _o: unknown, fn: (a: unknown) => unknown) => fn,
}));
vi.mock('@/lib/api/route.server', () => ({
  apiRoute: (_p: string, handlers: Record<string, unknown>) => ({
    handlers,
  }),
}));

const { route } = await import('@/lib/messages/api/messages.server');
type Post = (a: {
  request: Request;
  session: {
    user: {
      id: string;
    };
  };
}) => Promise<Response | object>;
const post = route.handlers.POST as unknown as Post;

const send = () =>
  post({
    request: new Request('http://x/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        recipientId: 'ana',
        content: 'hi',
      }),
    }),
    session: {
      user: {
        id: 'me',
      },
    },
  });

beforeEach(() => {
  h.blocks = [];
  h.upsertDm.mockClear();
  h.create.mockClear();
});

describe('POST /api/messages and blocks', () => {
  it.each([
    [
      'the recipient blocked the sender',
      {
        blockerId: 'ana',
        blockedId: 'me',
      },
    ],
    [
      'the sender blocked the recipient',
      {
        blockerId: 'me',
        blockedId: 'ana',
      },
    ],
  ])('refuses a new conversation when %s', async (_n, block) => {
    h.blocks = [block];
    const res = (await send()) as Response;
    expect(res.status).toBe(403);
    expect(h.upsertDm).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('starts the conversation when unblocked', async () => {
    const res = (await send()) as {
      conversationId: string;
    };
    expect(res.conversationId).toBe('dm1');
    expect(h.upsertDm).toHaveBeenCalledTimes(1);
  });
});

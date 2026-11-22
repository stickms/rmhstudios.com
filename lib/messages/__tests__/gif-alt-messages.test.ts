import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GIF descriptions in messages (sprint 06 #15): a direct and a group send store the description beside the GIF
 * (cleaned, never without a GIF), the body schemas take it and refuse one over the limit, a scheduled message keeps
 * it and carries it through to the message it becomes, and a forward keeps it. Prisma is a recording fake.
 */

const h = vi.hoisted(() => ({
  require: false,
  created: vi.fn(),
  updated: vi.fn(),
  scheduledCreated: vi.fn(),
  stored: null as null | Record<string, unknown>,
  access: null as null | {
    kind: 'dm' | 'group';
    id: string;
    participants: [string, string] | null;
  },
  publishMutation: vi.fn(),
  publishChatUpdate: vi.fn(),
  postChatMessage: vi.fn(),
  forwardSource: null as null | Record<string, unknown>,
  scheduledRow: null as null | Record<string, unknown>,
}));

// s04-16: the message-request gate has its own tests; these files are about scheduling and alt text.
vi.mock('@/lib/messages/requests.server', () => ({
  requestGate: async () => ({
    outcome: 'allowed',
  }),
  clearStaleDraft: async () => {},
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: {
      findUnique: async () => ({
        requireAltText: h.require,
        profile: {
          dmPrivacy: 'EVERYONE',
        },
      }),
    },
    userBlock: {
      findFirst: async () => null,
    },
    directMessageHide: {
      findUnique: async () => null,
    },
    chatMessage: {
      create: (a: unknown) => a,
      findFirst: async () => h.stored ?? h.forwardSource,
      update: async (a: unknown) => {
        h.updated(a);
        return a;
      },
    },
    chat: {
      update: (a: unknown) => a,
    },
    chatMember: {
      update: (a: unknown) => a,
    },
    scheduledChatMessage: {
      create: async (a: { data: Record<string, unknown> }) => {
        h.scheduledCreated(a);
        return {
          id: 's1',
          status: 'pending',
          failCode: null,
          sendAt: new Date('2026-12-01T10:00:00Z'),
          createdAt: new Date(),
          ...a.data,
        };
      },
      count: async () => 0,
      updateMany: async () => ({
        count: 1,
      }),
      findUnique: async () => h.scheduledRow,
      deleteMany: async () => ({
        count: 1,
      }),
    },
    $executeRaw: async () => 0,
    $transaction: async (
      arg:
        | ((tx: unknown) => Promise<unknown>)
        | {
            data?: Record<string, unknown>;
          }[],
    ) => {
      if (typeof arg === 'function') {
        const { prisma } = await import('@/lib/prisma.server');
        return arg(prisma);
      }
      h.created(arg[0]);
      const d = arg[0]!.data!;
      return [
        {
          id: 'm1',
          content: d.content,
          senderId: d.senderId,
          read: false,
          createdAt: new Date('2026-11-23T09:00:00Z'),
          gifUrl: d.gifUrl ?? null,
          gifAlt: d.gifAlt ?? null,
          imageUrls: d.imageUrls ?? [],
          imageAlts: d.imageAlts ?? [],
          expiresAt: null,
        },
      ];
    },
  },
}));
vi.mock('@/lib/chat/chat.server', () => ({
  findDm: async () => ({
    id: 'dm1',
    participantOneId: 'me',
    participantTwoId: 'ana',
    disappearAfterSec: null,
  }),
  findGroupMembership: async () => ({
    id: 'gm',
    chat: {
      disappearAfterSec: null,
    },
  }),
}));
vi.mock('@/lib/moderation/restrictions.server', () => ({
  restrictionResponse: async () => null,
}));
vi.mock('@/lib/admin-audit.server', () => ({
  getActiveBan: async () => null,
}));
vi.mock('@/lib/rate-limit.server', () => ({
  checkRateLimit: async () => ({
    allowed: true,
  }),
}));
vi.mock('@/lib/message-events', () => ({
  notifyUser: vi.fn(),
}));
vi.mock('@/lib/group-events', () => ({
  publishGroupMessage: vi.fn(),
}));
vi.mock('@/lib/chat-plus/unread.server', () => ({
  adjustDmUnread: vi.fn(),
}));
vi.mock('@/lib/chat-plus/post.server', () => ({
  messageStamp: () => ({
    expiresAt: null,
    attachFlags: 0,
  }),
  postChatMessage: h.postChatMessage,
}));
vi.mock('@/lib/group-chat/serialize.server', () => ({
  groupMessageSelect: {},
  serializeGroupMessages: async (
    rows: {
      id: string;
    }[],
  ) =>
    rows.map((r) => ({
      ...r,
      poll: null,
    })),
}));
vi.mock('@/lib/chat-plus/access.server', () => ({
  getChatAccess: async (kind: string) => (h.access && h.access.kind === kind ? h.access : null),
  publishChatUpdate: h.publishChatUpdate,
}));
vi.mock('@/lib/messages/mutations.server', () => ({
  publishMutation: h.publishMutation,
}));
vi.mock('@/lib/chat-plus/dm-privacy.server', () => ({
  canDirectMessage: async () => true,
}));
vi.mock('@/lib/chat-plus/expiry.server', () => ({
  liveMessages: () => ({}),
}));

const GIF = 'https://media.tenor.com/abc/cat.gif';

const { sendDirectMessage, sendGroupMessage } = await import('@/lib/messages/send.server');
const { scheduleMessage, sendScheduledNow, toScheduledRow } = await import('@/lib/messages/scheduled.server');
const { sendToConversationBody } = await import('@/lib/messages/message-actions-schema');
const { sendMessageSchema } = await import('@/lib/messages/messages-schema');
const { createScheduledMessageBody } = await import('@/lib/messages/scheduled-schema');
const { forwardMessage } = await import('@/lib/chat-plus/forward.server');
const { toMessageView } = await import('@/lib/messages/message-view');
const { MAX_GIF_ALT_LENGTH } = await import('@/lib/feed/gif-alt');

const direct = (input: Parameters<typeof sendDirectMessage>[0]['input']) =>
  sendDirectMessage({
    userId: 'me',
    conversationId: 'dm1',
    input,
    pairRateLimit: false,
  });

const stored = () =>
  (
    h.created.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    }
  ).data;

beforeEach(() => {
  h.require = false;
  h.stored = null;
  h.access = null;
  h.forwardSource = null;
  h.scheduledRow = null;
  for (const f of [h.created, h.updated, h.scheduledCreated, h.publishMutation, h.publishChatUpdate, h.postChatMessage])
    f.mockReset();
});

describe('a direct message', () => {
  it('stores the cleaned description beside the GIF and returns it', async () => {
    const res = await direct({
      content: '',
      gifUrl: GIF,
      gifAlt: '  A cat\nwaving  ',
    });
    expect(stored()).toMatchObject({
      gifUrl: GIF,
      gifAlt: 'A cat waving',
    });
    expect(res.ok && res.value.message.gifAlt).toBe('A cat waving');
  });

  it('stores null for a GIF without a description', async () => {
    await direct({
      content: '',
      gifUrl: GIF,
    });
    expect(stored().gifAlt).toBeNull();
  });

  it('never stores a description without a GIF', async () => {
    await direct({
      content: 'hello',
      gifAlt: 'orphan',
    });
    expect(stored().gifAlt).toBeNull();
  });
});

describe('a group message', () => {
  it('stores the cleaned description beside the GIF', async () => {
    await sendGroupMessage({
      userId: 'me',
      groupId: 'g1',
      membership: {
        id: 'gm',
        chat: {
          disappearAfterSec: null,
        },
      },
      input: {
        gifUrl: GIF,
        gifAlt: ' A cat  waving ',
      },
    } as never);
    expect(stored()).toMatchObject({
      gifUrl: GIF,
      gifAlt: 'A cat waving',
    });
  });

  it('never stores a description without a GIF', async () => {
    await sendGroupMessage({
      userId: 'me',
      groupId: 'g1',
      membership: {
        id: 'gm',
        chat: {
          disappearAfterSec: null,
        },
      },
      input: {
        content: 'hello',
        gifAlt: 'orphan',
      },
    } as never);
    expect(stored().gifAlt).toBeNull();
  });
});

describe('the body schemas', () => {
  const tooLong = 'x'.repeat(MAX_GIF_ALT_LENGTH + 1);
  const bodies = (gifAlt: string) => ({
    dm: sendToConversationBody.safeParse({
      content: 'x',
      gifUrl: GIF,
      gifAlt,
    }),
    start: sendMessageSchema.safeParse({
      recipientId: 'ana',
      gifUrl: GIF,
      gifAlt,
    }),
    later: createScheduledMessageBody.safeParse({
      chatId: 'dm1',
      gifUrl: GIF,
      gifAlt,
      sendAt: '2026-12-01T10:00:00Z',
    }),
  });

  it('take a description', () => {
    for (const r of Object.values(bodies('A cat waving'))) expect(r.success).toBe(true);
  });

  it('refuse a description over the limit', () => {
    for (const r of Object.values(bodies(tooLong))) expect(r.success).toBe(false);
  });
});

describe('a scheduled message', () => {
  it('keeps the description on the scheduled row', async () => {
    const res = await scheduleMessage(
      'me',
      {
        chatId: 'dm1',
        content: '',
        gifUrl: GIF,
        gifAlt: ' A cat ',
        sendAt: '2026-12-01T10:00:00Z',
      },
      Date.parse('2026-11-23T09:00:00Z'),
    );
    expect(res.ok).toBe(true);
    expect(h.scheduledCreated.mock.calls[0]![0].data).toMatchObject({
      gifUrl: GIF,
      gifAlt: 'A cat',
    });
  });

  it('lists the description with its row, and none without a GIF', () => {
    const base = {
      id: 's1',
      chatId: 'dm1',
      senderId: 'me',
      content: '',
      imageUrls: [],
      sendAt: new Date(),
      status: 'pending',
      failCode: null,
    };
    expect(
      toScheduledRow({
        ...base,
        gifUrl: GIF,
        gifAlt: 'A cat',
      }).gifAlt,
    ).toBe('A cat');
    expect(
      toScheduledRow({
        ...base,
        gifUrl: null,
        gifAlt: 'stale',
      }).gifAlt,
    ).toBeNull();
  });

  it('carries the description through to the message it becomes', async () => {
    h.scheduledRow = {
      id: 's1',
      chatId: 'dm1',
      senderId: 'me',
      content: '',
      gifUrl: GIF,
      gifAlt: 'A cat waving',
      imageUrls: [],
      imageAlts: [],
      sendAt: new Date(),
      status: 'sending',
      failCode: null,
      attempts: 1,
    };
    const res = await sendScheduledNow('me', 's1');
    expect(res.ok).toBe(true);
    expect(stored()).toMatchObject({
      gifUrl: GIF,
      gifAlt: 'A cat waving',
    });
  });
});

describe('a forward', () => {
  it('keeps the GIF description', async () => {
    h.access = {
      kind: 'dm',
      id: 'dm1',
      participants: ['me', 'ana'],
    };
    h.forwardSource = {
      id: 'm9',
      content: '',
      gifUrl: GIF,
      gifAlt: 'A cat waving',
      imageUrls: [],
      imageAlts: [],
      audioUrl: null,
      kind: 'text',
      forwardCount: 0,
      deletedAt: null,
    };
    await forwardMessage('me', {
      source: {
        kind: 'dm',
        id: 'dm1',
      },
      messageId: 'm9',
      targets: [
        {
          kind: 'dm',
          id: 'dm1',
        },
      ],
    } as never);
    expect(h.postChatMessage.mock.calls[0]![1]).toMatchObject({
      gifUrl: GIF,
      gifAlt: 'A cat waving',
    });
  });
});

describe('the message view', () => {
  const row = {
    id: 'm1',
    senderId: 'me',
    content: 'x',
    createdAt: new Date(),
  };

  it('shows the description beside a GIF', () => {
    expect(
      toMessageView({
        ...row,
        gifUrl: GIF,
        gifAlt: 'A cat',
      }).gifAlt,
    ).toBe('A cat');
  });

  it('shows none for an undescribed GIF, or for an unsent message', () => {
    expect(
      toMessageView({
        ...row,
        gifUrl: GIF,
      }).gifAlt,
    ).toBeNull();
    expect(
      toMessageView({
        ...row,
        gifUrl: GIF,
        gifAlt: 'A cat',
        deletedAt: new Date(),
      }).gifAlt,
    ).toBeNull();
  });
});

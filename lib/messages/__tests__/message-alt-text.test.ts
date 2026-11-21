import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Image descriptions in messages (s03-19): the length rule, the "Require image
 * descriptions" setting on the send paths (immediate and scheduled), who may
 * change a description and for how long, and that a forward keeps them.
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
          gifUrl: null,
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

const mine = (n: number) => `/api/feed/image/me-1700000000-abc${n}.png`;

const { sendDirectMessage, sendGroupMessage } = await import('@/lib/messages/send.server');
const { scheduleMessage } = await import('@/lib/messages/scheduled.server');
const { editMessageImageAlts } = await import('@/lib/messages/alt-edit.server');
const { forwardMessage } = await import('@/lib/chat-plus/forward.server');
const { sendToConversationBody } = await import('@/lib/messages/message-actions-schema');
const { sendMessageSchema } = await import('@/lib/messages/messages-schema');
const { createScheduledMessageBody } = await import('@/lib/messages/scheduled-schema');

const direct = (input: Parameters<typeof sendDirectMessage>[0]['input']) =>
  sendDirectMessage({
    userId: 'me',
    conversationId: 'dm1',
    input,
    pairRateLimit: false,
  });

beforeEach(() => {
  h.require = false;
  h.stored = null;
  h.access = null;
  h.forwardSource = null;
  for (const f of [h.created, h.updated, h.scheduledCreated, h.publishMutation, h.publishChatUpdate, h.postChatMessage])
    f.mockReset();
});

describe('lengths must match', () => {
  const urls = [mine(1), mine(2)];
  const parse = (alts: string[]) => ({
    dm: sendToConversationBody.safeParse({
      content: 'x',
      imageUrls: urls,
      imageAlts: alts,
    }),
    start: sendMessageSchema.safeParse({
      recipientId: 'ana',
      imageUrls: urls,
      imageAlts: alts,
    }),
    later: createScheduledMessageBody.safeParse({
      chatId: 'dm1',
      imageUrls: urls,
      imageAlts: alts,
      sendAt: '2026-12-01T10:00:00Z',
    }),
  });

  it('the three body schemas refuse a list of another length and accept an equal one', () => {
    for (const r of Object.values(parse(['only one']))) expect(r.success).toBe(false);
    for (const r of Object.values(parse(['a', 'b', 'c']))) expect(r.success).toBe(false);
    for (const r of Object.values(parse(['a', '']))) expect(r.success).toBe(true);
  });

  it('a description is at most 1,000 characters', () => {
    expect(parse(['a'.repeat(1001), '']).dm.success).toBe(false);
    expect(parse(['a'.repeat(1000), '']).dm.success).toBe(true);
  });

  it('a direct send refuses a mismatch that got past the schema (the cron path) and stores nothing', async () => {
    const r = await direct({
      content: 'x',
      imageUrls: [mine(1)],
      imageAlts: ['a', 'b'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('alt-mismatch');
      expect(r.response.status).toBe(400);
    }
    expect(h.created).not.toHaveBeenCalled();
  });

  it('a group send refuses a mismatch too', async () => {
    const r = await sendGroupMessage({
      userId: 'me',
      groupId: 'g1',
      input: {
        content: 'x',
        imageUrls: [mine(1)],
        poll: undefined,
      },
    });
    expect(r.ok).toBe(true);
    const bad = await sendGroupMessage({
      userId: 'me',
      groupId: 'g1',
      input: {
        content: 'x',
        imageUrls: [mine(1)],
        imageAlts: ['a', 'b'],
      },
    });
    expect(bad.ok).toBe(false);
  });
});

describe('the require setting', () => {
  it('refuses an undescribed image with a 422 and a code the composer reads', async () => {
    h.require = true;
    const r = await direct({
      content: '',
      imageUrls: [mine(1)],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(422);
      expect(await r.response.json()).toMatchObject({
        code: 'alt-text-required',
      });
    }
    expect(h.created).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only description as none', async () => {
    h.require = true;
    const r = await direct({
      content: '',
      imageUrls: [mine(1)],
      imageAlts: ['   '],
    });
    expect(r.ok).toBe(false);
  });

  it('accepts a described image and stores the trimmed description', async () => {
    h.require = true;
    const r = await direct({
      content: '',
      imageUrls: [mine(1), mine(2)],
      imageAlts: ['  a dog  ', 'a beach'],
    });
    expect(r.ok).toBe(true);
    expect(h.created.mock.calls[0]![0].data.imageAlts).toEqual(['a dog', 'a beach']);
    if (r.ok) expect(r.value.message.imageAlts).toEqual(['a dog', 'a beach']);
  });

  it('is off by default: an undescribed image is stored with empty descriptions', async () => {
    const r = await direct({
      content: '',
      imageUrls: [mine(1)],
    });
    expect(r.ok).toBe(true);
    expect(h.created.mock.calls[0]![0].data.imageAlts).toEqual(['']);
  });

  it('applies to group messages', async () => {
    h.require = true;
    const base = {
      userId: 'me',
      groupId: 'g1',
    };
    const refused = await sendGroupMessage({
      ...base,
      input: {
        imageUrls: [mine(1)],
      },
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.response.status).toBe(422);
    const accepted = await sendGroupMessage({
      ...base,
      input: {
        imageUrls: [mine(1)],
        imageAlts: ['a dog'],
      },
    });
    expect(accepted.ok).toBe(true);
  });

  it('applies when a message is scheduled, and the description is stored on the row', async () => {
    h.require = true;
    const sendAt = '2026-12-01T10:00:00Z';
    const now = Date.parse('2026-11-23T09:00:00Z');
    const refused = await scheduleMessage(
      'me',
      {
        chatId: 'dm1',
        content: '',
        imageUrls: [mine(1)],
        sendAt,
      },
      now,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.status).toBe(422);
    const ok = await scheduleMessage(
      'me',
      {
        chatId: 'dm1',
        content: '',
        imageUrls: [mine(1)],
        imageAlts: ['a dog'],
        sendAt,
      },
      now,
    );
    expect(ok.ok).toBe(true);
    expect(h.scheduledCreated.mock.calls[0]![0].data.imageAlts).toEqual(['a dog']);
    if (ok.ok) expect(ok.row.imageAlts).toEqual(['a dog']);
  });
});

describe('editing descriptions after sending', () => {
  const sentAt = new Date('2026-11-23T09:00:00Z');
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    senderId: 'me',
    createdAt: sentAt,
    deletedAt: null,
    imageUrls: [mine(1), mine(2)],
    imageAlts: ['', ''],
    content: 'x',
    editedAt: null,
    gifUrl: null,
    deletedBy: null,
    audioUrl: null,
    ...over,
  });
  const edit = (over: Partial<Parameters<typeof editMessageImageAlts>[0]> = {}) =>
    editMessageImageAlts({
      chatId: 'dm1',
      messageId: 'm1',
      userId: 'me',
      imageAlts: [' a dog ', 'a beach'],
      now: new Date(sentAt.getTime() + 23 * 3_600_000),
      ...over,
    });

  beforeEach(() => {
    h.access = {
      kind: 'dm',
      id: 'dm1',
      participants: ['me', 'ana'],
    };
    h.stored = row();
  });

  it('the sender can change them within 24 hours, without marking the message edited', async () => {
    const r = await edit();
    expect(r).toEqual({
      ok: true,
      imageAlts: ['a dog', 'a beach'],
    });
    expect(h.updated.mock.calls[0]![0].data).toEqual({
      imageAlts: ['a dog', 'a beach'],
      // Marked for offline catch-up; editedAt is untouched.
      altsEditedAt: new Date(sentAt.getTime() + 23 * 3_600_000),
    });
  });

  it('offline catch-up also reports description edits', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('lib/messages/mutations.server.ts', 'utf8');
    expect(src).toMatch(/altsEditedAt:\s*\{\s*gt:\s*args\.since/);
  });

  it('a direct message answers with the existing message-edited event carrying the descriptions', async () => {
    await edit();
    expect(h.publishMutation).toHaveBeenCalledWith(
      'message-edited',
      expect.objectContaining({
        imageAlts: ['a dog', 'a beach'],
        actorId: 'me',
      }),
    );
    expect(h.publishChatUpdate).not.toHaveBeenCalled();
  });

  it('a group message answers with a chat update of op alts', async () => {
    h.access = {
      kind: 'group',
      id: 'g1',
      participants: null,
    };
    await edit({
      chatId: 'g1',
    });
    expect(h.publishChatUpdate).toHaveBeenCalledWith(h.access, {
      kind: 'group',
      chatId: 'g1',
      op: 'alts',
      messageId: 'm1',
      imageAlts: ['a dog', 'a beach'],
    });
    expect(h.publishMutation).not.toHaveBeenCalled();
  });

  it('refuses anyone but the sender', async () => {
    const r = await edit({
      userId: 'ana',
    });
    expect(r).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(h.updated).not.toHaveBeenCalled();
  });

  it('refuses after 24 hours', async () => {
    const r = await edit({
      now: new Date(sentAt.getTime() + 25 * 3_600_000),
    });
    expect(r).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(h.updated).not.toHaveBeenCalled();
  });

  it('refuses an unsent message, a message with no images and a list of another length', async () => {
    h.stored = row({
      deletedAt: sentAt,
    });
    expect(await edit()).toMatchObject({
      ok: false,
      status: 409,
    });
    h.stored = row({
      imageUrls: [],
      imageAlts: [],
    });
    expect(
      await edit({
        imageAlts: ['x'],
      }),
    ).toMatchObject({
      ok: false,
      status: 400,
    });
    h.stored = row();
    expect(
      await edit({
        imageAlts: ['only one'],
      }),
    ).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(h.updated).not.toHaveBeenCalled();
  });

  it('is a 404 for someone who is not in the chat', async () => {
    h.access = null;
    expect(await edit()).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe('forwarding', () => {
  it('copies the descriptions to every target', async () => {
    h.access = {
      kind: 'dm',
      id: 'dm1',
      participants: ['me', 'ana'],
    };
    h.forwardSource = {
      id: 'm1',
      content: 'look',
      gifUrl: null,
      imageUrls: [mine(1), mine(2)],
      imageAlts: ['a dog', ''],
      audioUrl: null,
      kind: 'text',
      forwardCount: 0,
      deletedAt: null,
    };
    const r = await forwardMessage('me', {
      source: {
        kind: 'dm',
        id: 'dm1',
      },
      messageId: 'm1',
      targets: [
        {
          kind: 'dm',
          id: 'dm1',
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(h.postChatMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        imageUrls: [mine(1), mine(2)],
        imageAlts: ['a dog', ''],
      }),
    );
  });
});

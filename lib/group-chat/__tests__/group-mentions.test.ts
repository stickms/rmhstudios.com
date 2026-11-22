import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  members: [] as {
    userId: string;
    user: {
      handle: string | null;
      bannedUntil: Date | null;
    };
  }[],
  blocks: [] as {
    blockerId: string;
    blockedId: string;
  }[],
  createMany: vi.fn(async (_a: unknown) => ({
    count: 0,
  })),
  mentionFind: vi.fn(async (_a: unknown) => [] as unknown[]),
  memberFind: vi.fn(),
  notify: vi.fn(async (_a: unknown) => undefined),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    chatMember: {
      findMany: (a: unknown) => (db.memberFind(a), Promise.resolve(db.members)),
    },
    userBlock: {
      findMany: async () => db.blocks,
    },
    chatMention: {
      createMany: db.createMany,
      findMany: db.mentionFind,
    },
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: db.notify,
}));

import { afterGroupMessage, listMyMentions, notifyMentions, recordMentions } from '@/lib/group-chat/mentions.server';
import { shouldDeliver } from '@/lib/notify/conversation-prefs.server';

const member = (userId: string, handle: string | null, bannedUntil: Date | null = null) => ({
  userId,
  user: {
    handle,
    bannedUntil,
  },
});
const base = {
  messageId: 'msg1',
  chatId: 'chat1',
  groupName: 'Crew',
  senderId: 'sender',
};

beforeEach(() => {
  vi.clearAllMocks();
  db.blocks = [];
  db.members = [member('sender', 'sam'), member('a', 'ann'), member('b', 'bob'), member('c', 'cy')];
});

const notifiedIds = () =>
  db.notify.mock.calls
    .map(
      (c) =>
        (
          c[0] as {
            userId: string;
          }
        ).userId,
    )
    .sort();

describe('recordMentions + notifyMentions', () => {
  it('stores and notifies each of two mentions once, with one membership read and one createMany', async () => {
    await afterGroupMessage({
      ...base,
      content: 'hey @ann and @Bob',
    });
    expect(db.memberFind).toHaveBeenCalledTimes(1);
    expect(db.createMany).toHaveBeenCalledTimes(1);
    expect(
      (
        db.createMany.mock.calls[0]![0] as {
          data: unknown[];
        }
      ).data,
    ).toHaveLength(2);
    expect(notifiedIds()).toEqual(['a', 'b']);
  });

  it('notifies through the group conversation key as an addressed system notification', async () => {
    await afterGroupMessage({
      ...base,
      content: '@ann',
    });
    expect(db.notify.mock.calls[0]![0]).toMatchObject({
      userId: 'a',
      actorId: 'sender',
      type: 'SYSTEM',
      entityType: 'group-mention',
      entityId: 'msg1',
      conversationKey: 'group:chat1',
      addressed: true,
    });
  });

  it('ignores a non-member handle, a self-mention and a message with no @', async () => {
    await afterGroupMessage({
      ...base,
      content: '@ghost @sam',
    });
    expect(db.notify).not.toHaveBeenCalled();
    expect(db.createMany).not.toHaveBeenCalled();
    db.memberFind.mockClear();
    await afterGroupMessage({
      ...base,
      content: 'plain text',
    });
    expect(db.memberFind).not.toHaveBeenCalled();
  });

  it('notifies a repeated handle once', async () => {
    await afterGroupMessage({
      ...base,
      content: '@ann @Ann @ANN',
    });
    expect(notifiedIds()).toEqual(['a']);
  });

  it('skips a recipient who blocked the sender and one the sender blocked', async () => {
    db.blocks = [
      {
        blockerId: 'a',
        blockedId: 'sender',
      },
      {
        blockerId: 'sender',
        blockedId: 'b',
      },
    ];
    await afterGroupMessage({
      ...base,
      content: '@ann @bob @cy',
    });
    expect(notifiedIds()).toEqual(['c']);
  });

  it('skips a banned recipient', async () => {
    db.members = [member('sender', 'sam'), member('a', 'ann', new Date(Date.now() + 86_400_000))];
    await afterGroupMessage({
      ...base,
      content: '@ann',
    });
    expect(db.notify).not.toHaveBeenCalled();
  });

  it('notifies at most ten members', async () => {
    db.members = [
      member('sender', 'sam'),
      ...Array.from(
        {
          length: 13,
        },
        (_, i) => member(`m${i}`, `h${i}`),
      ),
    ];
    const content = Array.from(
      {
        length: 13,
      },
      (_, i) => `@h${i}`,
    ).join(' ');
    const r = await recordMentions({
      ...base,
      content,
    });
    expect(r.mentioned).toHaveLength(13);
    expect(r.notify).toHaveLength(10);
    await notifyMentions({
      ...base,
      content,
      notify: r.notify,
    });
    expect(db.notify).toHaveBeenCalledTimes(10);
  });

  it('never throws: a failure in storing or notifying leaves the send alone', async () => {
    db.createMany.mockRejectedValueOnce(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      afterGroupMessage({
        ...base,
        content: '@ann',
      }),
    ).resolves.toBeUndefined();
    db.notify.mockRejectedValueOnce(new Error('push down'));
    await expect(
      afterGroupMessage({
        ...base,
        content: '@ann @bob',
      }),
    ).resolves.toBeUndefined();
    expect(notifiedIds()).toContain('b');
    spy.mockRestore();
  });
});

describe('delivery rules the notification relies on (shouldDeliver, addressed)', () => {
  const future = new Date(Date.now() + 3_600_000);
  it('a muted group is silent even for a mention', () => {
    expect(
      shouldDeliver(
        {
          muteUntil: future,
          mentionsOnly: false,
          pinned: false,
        },
        true,
      ),
    ).toBe(false);
  });
  it('a mentions-only group delivers a mention and not an ordinary message', () => {
    const pref = {
      muteUntil: null,
      mentionsOnly: true,
      pinned: false,
    };
    expect(shouldDeliver(pref, true)).toBe(true);
    expect(shouldDeliver(pref, false)).toBe(false);
  });
});

describe('listMyMentions', () => {
  it('reads only the viewer’s rows in this group, hides gone messages and blocked senders, and pages by cursor', async () => {
    db.blocks = [
      {
        blockerId: 'me',
        blockedId: 'bad',
      },
    ];
    const rows = Array.from(
      {
        length: 21,
      },
      (_, i) => ({
        messageId: `m${i}`,
        createdAt: new Date(2026, 10, 20, 12, 0, 59 - i),
        message: {
          content: 'x'.repeat(300),
          sender: {
            id: 's',
            name: 'S',
            handle: 's',
          },
        },
      }),
    );
    db.mentionFind.mockResolvedValueOnce(rows);
    const page = await listMyMentions('me', 'chat1', null);
    const where = (
      db.mentionFind.mock.calls[0]![0] as {
        where: Record<string, unknown>;
      }
    ).where;
    expect(where).toMatchObject({
      userId: 'me',
      chatId: 'chat1',
      message: {
        deletedAt: null,
        senderId: {
          notIn: ['bad'],
        },
      },
    });
    expect(page.mentions).toHaveLength(20);
    expect(page.mentions[0]!.snippet).toHaveLength(160);
    expect(page.next).toBe(rows[19]!.createdAt.toISOString());
  });
});

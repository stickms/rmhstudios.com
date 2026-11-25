import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s14-20 (b): taking down a reply in a group thread lowers the parent's `replyCount` by one, in the same transaction
 * as the delete and never below zero. A top-level message decrements nothing.
 */

type Msg = { id: string; chatId: string; senderId: string; threadParentId: string | null; replyCount: number };

const h = vi.hoisted(() => ({
  msgs: [] as Msg[],
  published: [] as unknown[],
  inTx: 0,
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const chatMessage = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const m = h.msgs.find((x) => x.id === where.id);
      return m ? { ...m, chat: { kind: 'group' } } : null;
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => {
      const before = h.msgs.length;
      h.msgs = h.msgs.filter((x) => x.id !== where.id);
      return { count: before - h.msgs.length };
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; replyCount?: { gt: number } };
        data: { replyCount: { decrement: number } };
      }) => {
        const m = h.msgs.find(
          (x) => x.id === where.id && (where.replyCount ? x.replyCount > where.replyCount.gt : true),
        );
        if (!m) return { count: 0 };
        m.replyCount -= data.replyCount.decrement;
        return { count: 1 };
      },
    ),
  };
  const client = shapeChecked({ chatMessage });
  return {
    prisma: {
      ...client,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        h.inTx++;
        try {
          return await fn(client);
        } finally {
          h.inTx--;
        }
      },
    },
  };
});
vi.mock('@/lib/chat-plus/access.server', () => ({ getChatAccess: vi.fn() }));
vi.mock('@/lib/group-events', () => ({ publishGroupEvent: vi.fn((_c: string, e: unknown) => h.published.push(e)) }));
vi.mock('@/lib/chat/chat.server', () => ({ findDm: vi.fn() }));
vi.mock('@/lib/messages/edit-history.server', () => ({ readPriorRevisionsFor: vi.fn() }));
vi.mock('@/lib/messages/mutations.server', () => ({ publishMutation: vi.fn() }));

import { takeDownDmMessage } from '@/lib/messages/dm-reports.server';

beforeEach(() => {
  h.published = [];
  h.msgs = [
    { id: 'parent', chatId: 'g1', senderId: 'a', threadParentId: null, replyCount: 2 },
    { id: 'reply1', chatId: 'g1', senderId: 'b', threadParentId: 'parent', replyCount: 0 },
    { id: 'reply2', chatId: 'g1', senderId: 'c', threadParentId: 'parent', replyCount: 0 },
    { id: 'zero', chatId: 'g1', senderId: 'a', threadParentId: null, replyCount: 0 },
    { id: 'drifted', chatId: 'g1', senderId: 'b', threadParentId: 'zero', replyCount: 0 },
  ];
});

const count = (id: string) => h.msgs.find((m) => m.id === id)?.replyCount;

describe('group-message takedown and the parent reply count', () => {
  it('lowers the parent by one for a thread reply', async () => {
    expect(await takeDownDmMessage('reply1')).toEqual({ removed: true });
    expect(count('parent')).toBe(1);
    expect(h.msgs.some((m) => m.id === 'reply1')).toBe(false);
    expect(h.published).toHaveLength(1);
  });

  it('never goes below zero', async () => {
    await takeDownDmMessage('drifted');
    expect(count('zero')).toBe(0);
  });

  it('decrements nothing for a top-level message', async () => {
    await takeDownDmMessage('parent');
    expect(count('zero')).toBe(0);
    expect(h.msgs.find((m) => m.id === 'reply1')?.replyCount).toBe(0);
  });

  it('is idempotent: a second takedown of the same reply leaves the count alone', async () => {
    await takeDownDmMessage('reply1');
    expect(await takeDownDmMessage('reply1')).toEqual({ removed: false });
    expect(count('parent')).toBe(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s15-18 (S13-17): two edits of one message sent at once leave two earlier versions. `editDirectMessage` locks the
 * message row (`SELECT ... FOR NO KEY UPDATE` on `chat_message`) before it snapshots, so the second edit waits for the first
 * to commit and snapshots the text the first one wrote. The fake database serialises on that lock the way Postgres
 * does, and a control run without the lock shows the lost version the lock prevents.
 */

type Edit = { id: string; messageId: string; content: string; replacedAt: Date };

const h = vi.hoisted(() => ({
  content: 'v0',
  edits: [] as Array<{ id: string; messageId: string; content: string; replacedAt: Date }>,
  /** Honour the row lock (true), or ignore it to show what an unlocked READ COMMITTED edit does (false). */
  enforceLock: true,
  locks: [] as Array<{ sql: string; values: unknown[] }>,
  holder: null as Promise<void> | null,
  seq: 0,
}));

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

vi.mock('@/lib/prisma.server', async () => {
  const messageRow = () => ({
    id: 'm1',
    senderId: 'u1',
    content: h.content,
    read: false,
    createdAt: new Date('2026-12-21T11:59:00Z'),
    gifUrl: null,
    gifAlt: null,
    imageUrls: [],
    imageAlts: [],
    editedAt: null,
    deletedAt: null,
    deletedBy: null,
    audioUrl: null,
    audioDurationMs: null,
    audioPeaks: [],
    kind: 'text',
    meta: null,
    forwardCount: 0,
    expiresAt: null,
  });
  const client = {
    chatMessage: { findFirst: async () => messageRow() },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      let release: () => void = () => {};
      const mine = new Promise<void>((resolve) => (release = resolve));
      let acquired = false;
      const tx = {
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          h.locks.push({ sql: strings.join('?'), values });
          if (!h.enforceLock) return [];
          // Wait for whoever holds the row, then hold it until this transaction ends.
          while (h.holder) await h.holder;
          h.holder = mine;
          acquired = true;
          return [];
        },
        chatMessageEdit: {
          create: async ({ data }: { data: { messageId: string; content: string; replacedAt: Date } }) => {
            await tick();
            h.edits.push({ id: `e${++h.seq}`, ...data });
            return h.edits.at(-1);
          },
          findMany: async () => [] as Edit[],
          deleteMany: async () => ({ count: 0 }),
        },
        chatMessage: {
          // READ COMMITTED: each read sees whatever has committed by now.
          findUnique: async () => {
            await tick();
            return { content: h.content };
          },
          update: async ({ data }: { data: { content: string } }) => {
            await tick();
            h.content = data.content;
            return { ...messageRow(), content: data.content };
          },
        },
      };
      try {
        return await fn(tx);
      } finally {
        if (acquired) {
          h.holder = null;
          release();
        }
      }
    },
  };
  return { prisma: (await import('@/lib/db/query-shape')).shapeChecked(client) };
});
vi.mock('@/lib/chat/chat.server', () => ({
  findDmFor: vi.fn(async () => ({ id: 'chat1', participantOneId: 'u1', participantTwoId: 'u2', request: null })),
}));
vi.mock('@/lib/message-events', () => ({ notifyUser: vi.fn() }));
vi.mock('@/lib/chat-plus/expiry.server', () => ({ liveMessages: () => ({}) }));
vi.mock('@/lib/chat-plus/receipts.server', () => ({ getPairPrivacy: vi.fn(), maskReceipts: vi.fn() }));
vi.mock('@/lib/messages/requests.server', () => ({ requestGate: vi.fn() }));
vi.mock('@/lib/chat-plus/polls.server', () => ({ loadDmPolls: vi.fn() }));

import { editDirectMessage } from '@/lib/messages/mutations.server';

const NOW = new Date('2026-12-21T12:00:00Z');
const edit = (content: string) =>
  editDirectMessage({ conversationId: 'chat1', messageId: 'm1', userId: 'u1', content, now: NOW });

beforeEach(() => {
  h.content = 'v0';
  h.edits = [];
  h.enforceLock = true;
  h.locks = [];
  h.holder = null;
  h.seq = 0;
});

describe('two edits at once', () => {
  it('leave two earlier versions, each the text its edit replaced, and both succeed', async () => {
    const [a, b] = await Promise.all([edit('first edit'), edit('second edit')]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(h.edits.map((e) => e.content)).toEqual(['v0', 'first edit']);
    expect(h.content).toBe('second edit');
  });

  it('take the row lock before the first read of the text', async () => {
    await edit('only edit');
    expect(h.locks).toHaveLength(1);
    expect(h.locks[0]!.sql.replace(/\s+/g, ' ').trim()).toBe(
      'SELECT "id" FROM "chat_message" WHERE "id" = ? FOR NO KEY UPDATE',
    );
    expect(h.locks[0]!.values).toEqual(['m1']);
    expect(h.edits.map((e) => e.content)).toEqual(['v0']);
  });

  it('without the lock the same race loses a version (the control)', async () => {
    h.enforceLock = false;
    await Promise.all([edit('first edit'), edit('second edit')]);
    expect(h.edits.map((e) => e.content)).toEqual(['v0', 'v0']);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s13-17: what a message said before an edit replaced it lives in `chat_message_edit`, written in the edit's own
 * transaction. An edit writes a version; up to ten read back newest first; the nightly prune keeps the versions of a
 * message a report still waits on; and the raw SQL names the real table and quoted columns.
 */

type Row = Record<string, unknown> & { id: string; messageId: string; content: string; replacedAt: Date };

const h = vi.hoisted(() => ({
  edits: [] as Row[],
  message: null as null | Record<string, unknown>,
  txCalls: [] as string[],
  failUpdate: false,
  raw: [] as { sql: string; values: unknown[] }[],
  rawResults: [] as number[],
  seq: 0,
}));

const byNewest = (a: Row, b: Row) => b.replacedAt.getTime() - a.replacedAt.getTime() || (b.id > a.id ? 1 : -1);

function editModel(log?: string[]) {
  return {
    create: vi.fn(async ({ data }: { data: { messageId: string; content: string; replacedAt: Date } }) => {
      log?.push('edit.create');
      const row: Row = { id: `e${++h.seq}`, ...data };
      h.edits.push(row);
      return row;
    }),
    findMany: vi.fn(
      async ({
        where,
        skip = 0,
        take,
      }: {
        where: { messageId: string | { in: string[] } };
        skip?: number;
        take?: number;
      }) => {
        const ids = typeof where.messageId === 'string' ? [where.messageId] : where.messageId.in;
        const rows = h.edits.filter((r) => ids.includes(r.messageId)).sort(byNewest);
        return rows.slice(skip, take === undefined ? undefined : skip + take);
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
      const gone = new Set(where.id.in);
      h.edits = h.edits.filter((r) => !gone.has(r.id));
      return { count: gone.size };
    }),
  };
}

vi.mock('@/lib/prisma.server', () => {
  const tx = () => {
    const log: string[] = [];
    h.txCalls = log;
    return {
      chatMessageEdit: editModel(log),
      chatMessage: {
        findUnique: vi.fn(async () => ({ content: h.message?.content })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          log.push('message.update');
          if (h.failUpdate) throw new Error('update failed');
          h.message = { ...h.message, ...data };
          return h.message;
        }),
      },
    };
  };
  return {
    prisma: {
      chatMessageEdit: editModel(),
      chatMessage: {
        findFirst: vi.fn(async () => h.message),
      },
      $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
        const snapshot = [...h.edits];
        try {
          return await fn(tx());
        } catch (e) {
          h.edits = snapshot;
          throw e;
        }
      }),
      $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        h.raw.push({ sql: strings.join('?'), values });
        return h.rawResults.shift() ?? 0;
      }),
    },
  };
});
vi.mock('@/lib/chat/chat.server', () => ({
  findDmFor: vi.fn(async () => ({ id: 'chat1', participantOneId: 'u1', participantTwoId: 'u2', request: null })),
}));
vi.mock('@/lib/message-events', () => ({ notifyUser: vi.fn() }));
vi.mock('@/lib/chat-plus/expiry.server', () => ({ liveMessages: () => ({}) }));
vi.mock('@/lib/chat-plus/receipts.server', () => ({ getPairPrivacy: vi.fn(), maskReceipts: vi.fn() }));
vi.mock('@/lib/messages/requests.server', () => ({ requestGate: vi.fn() }));
vi.mock('@/lib/chat-plus/polls.server', () => ({ loadDmPolls: vi.fn() }));

const NOW = new Date('2026-12-21T12:00:00Z');
const DAY = 86_400_000;

import {
  EDIT_HISTORY_TTL_MS,
  MAX_REVISIONS,
  pruneMessageEdits,
  readPriorRevisions,
  recordPriorRevision,
} from '@/lib/messages/edit-history.server';
import { editDirectMessage } from '@/lib/messages/mutations.server';

beforeEach(() => {
  h.edits = [];
  h.raw = [];
  h.rawResults = [];
  h.failUpdate = false;
  h.seq = 0;
  h.message = {
    id: 'm1',
    senderId: 'u1',
    content: 'the original words',
    read: false,
    createdAt: new Date(NOW.getTime() - 60_000),
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
  };
});

describe('an edit writes a version in its own transaction', () => {
  it('snapshots the old text, then overwrites it, in one transaction', async () => {
    const result = await editDirectMessage({
      conversationId: 'chat1',
      messageId: 'm1',
      userId: 'u1',
      content: 'something milder',
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(h.txCalls).toEqual(['edit.create', 'message.update']);
    expect(h.edits).toHaveLength(1);
    expect(h.edits[0]).toMatchObject({ messageId: 'm1', content: 'the original words', replacedAt: NOW });
    expect(h.message?.content).toBe('something milder');
  });

  it('a failed edit leaves no version behind', async () => {
    h.failUpdate = true;
    await expect(
      editDirectMessage({ conversationId: 'chat1', messageId: 'm1', userId: 'u1', content: 'x', now: NOW }),
    ).rejects.toThrow('update failed');
    expect(h.edits).toHaveLength(0);
  });

  it('a refused edit (not the sender) writes nothing', async () => {
    const result = await editDirectMessage({
      conversationId: 'chat1',
      messageId: 'm1',
      userId: 'u2',
      content: 'not mine',
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(h.edits).toHaveLength(0);
  });
});

describe('reading the versions', () => {
  it('keeps and returns the newest ten, newest first', async () => {
    const tx = { chatMessageEdit: editModel() };
    for (let i = 1; i <= 12; i++) {
      await recordPriorRevision(tx as never, 'm1', `v${i}`, new Date(NOW.getTime() + i * 1000));
    }
    expect(MAX_REVISIONS).toBe(10);
    expect(h.edits).toHaveLength(10);
    const read = await readPriorRevisions('m1');
    expect(read.map((r) => r.content)).toEqual(['v12', 'v11', 'v10', 'v9', 'v8', 'v7', 'v6', 'v5', 'v4', 'v3']);
    expect(read[0]!.replacedAt).toBe(new Date(NOW.getTime() + 12_000).toISOString());
  });

  it('reads nothing for a message that was never edited', async () => {
    expect(await readPriorRevisions('m-never')).toEqual([]);
  });
});

describe('the nightly prune', () => {
  it('cuts at the 30-day window and names the real table and quoted columns', async () => {
    expect(EDIT_HISTORY_TTL_MS).toBe(30 * DAY);
    await pruneMessageEdits(NOW);
    expect(h.raw).toHaveLength(1);
    const { sql, values } = h.raw[0]!;
    expect(sql).toContain('DELETE FROM "chat_message_edit"');
    expect(sql).toContain('FROM "chat_message_edit" e');
    expect(sql).toContain('e."replacedAt" <');
    expect(sql).toContain('e."messageId"');
    expect(sql).toContain('"content_report"');
    expect(values[0]).toEqual(new Date(NOW.getTime() - 30 * DAY));
  });

  it('keeps the versions of a message a report is waiting on', async () => {
    await pruneMessageEdits(NOW);
    const sql = h.raw[0]!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain(`r."entityType" = 'dm'`);
    expect(sql).toContain('r."entityId" = e."messageId"');
    expect(sql).toContain(`r."status" IN ('PENDING', 'REVIEWING')`);
  });

  it('works in batches of 1,000 until a batch comes up short', async () => {
    h.rawResults = [1000, 1000, 250];
    const total = await pruneMessageEdits(NOW);
    expect(total).toBe(2250);
    expect(h.raw).toHaveLength(3);
    expect(h.raw.every((r) => r.values[1] === 1000)).toBe(true);
  });
});

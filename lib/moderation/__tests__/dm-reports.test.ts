import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';
import { REMOVABLE_REPORT_ENTITY_TYPES, REPORT_ENTITY_TYPES } from '@/lib/moderation/report-constants';

/**
 * s13-17: a member of a direct or group conversation reports another member's message as `dm`. A non-member, the
 * sender, an unsent or expired message and a system line are refused (a stranger gets the same answer as an unknown
 * id); the report is about the sender; the moderator reads one message with its earlier versions; and removing it
 * deletes it as a moderator.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  messages: [] as Row[],
  chats: {} as Record<string, { kind: 'dm' | 'group'; members: string[] }>,
  edits: [] as Row[],
  reports: [] as Row[],
  reactionDeletes: [] as Row[],
  published: [] as { type: string; row: Row }[],
  groupEvents: [] as { id: string; payload: Row }[],
}));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'in' in (v as Row)) return ((v as Row).in as unknown[]).includes(row[k]);
    if (v === null) return row[k] === null || row[k] === undefined;
    return row[k] === v;
  });
const withChat = (row: Row) => ({ ...row, chat: { kind: h.chats[row.chatId as string]?.kind } });

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    chatMessage: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const row = h.messages.find((r) => matches(r, where));
        return row ? withChat(row) : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Row }) => h.messages.filter((r) => matches(r, where)).map(withChat)),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = h.messages.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        const hit = h.messages.filter((r) => matches(r, where));
        h.messages = h.messages.filter((r) => !hit.includes(r));
        return { count: hit.length };
      }),
    },
    chatMessageReaction: {
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        h.reactionDeletes.push(where);
        return { count: 0 };
      }),
    },
    chatMessageEdit: {
      findMany: vi.fn(async ({ where }: { where: { messageId: { in: string[] } } }) =>
        h.edits
          .filter((e) => where.messageId.in.includes(e.messageId as string))
          .sort((a, b) => (b.replacedAt as Date).getTime() - (a.replacedAt as Date).getTime()),
      ),
    },
    contentReport: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        h.reports.push(data);
        return data;
      }),
    },
  },
}));
vi.mock('@/lib/api/handler.server', () => ({ defineHandler: (_o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/admin-review.server', () => ({ notifyAdminsOfReview: vi.fn(async () => {}) }));
vi.mock('@/lib/rmhmusic/learn/moderation.server', () => ({ musicReportOwner: vi.fn(), hideMusicContent: vi.fn() }));
vi.mock('@/lib/cached.server', () => ({ cached: vi.fn(), invalidateCached: vi.fn(async () => {}) }));
vi.mock('@/lib/chat-plus/access.server', () => ({
  getChatAccess: vi.fn(async (kind: string, id: string, userId: string) => {
    const chat = h.chats[id];
    return chat && chat.kind === kind && chat.members.includes(userId) ? { kind, id, viewerId: userId } : null;
  }),
}));
vi.mock('@/lib/group-events', () => ({
  publishGroupEvent: vi.fn((id: string, payload: Row) => {
    h.groupEvents.push({ id, payload });
  }),
}));
vi.mock('@/lib/chat/chat.server', () => ({
  findDm: vi.fn(async (id: string) => ({ id, participantOneId: 'sender', participantTwoId: 'reader', request: null })),
}));
vi.mock('@/lib/messages/mutations.server', () => ({
  publishMutation: vi.fn(async (type: string, args: { row: Row }) => {
    h.published.push({ type, row: args.row });
    return {};
  }),
}));

type Handler = (a: { session: { user: { id: string } }; body: Record<string, unknown> }) => Promise<Response>;

async function report(reporter: string, entityId: string) {
  const mod = await import('@/lib/moderation/api/moderation.report.server');
  const post = handlersOfModule<Handler>(mod).POST!;
  return post({ session: { user: { id: reporter } }, body: { entityType: 'dm', entityId, reason: 'HARASSMENT' } });
}

const NOW = new Date('2026-12-21T12:00:00Z');
const base = (over: Row): Row => ({
  senderId: 'sender',
  kind: 'text',
  content: 'the threat',
  createdAt: new Date('2026-12-21T10:00:00Z'),
  editedAt: null,
  deletedAt: null,
  deletedBy: null,
  expiresAt: null,
  gifUrl: null,
  imageUrls: [],
  imageAlts: [],
  ...over,
});

beforeEach(() => {
  h.groupEvents = [];
  h.chats = {
    c1: { kind: 'dm', members: ['sender', 'reader'] },
    g1: { kind: 'group', members: ['sender', 'reader', 'third'] },
  };
  h.messages = [
    base({ id: 'm1', chatId: 'c1' }),
    base({ id: 'm-group', chatId: 'g1', content: 'group abuse' }),
    base({ id: 'm-system', chatId: 'c1', kind: 'system', content: 'Timer set' }),
    base({ id: 'm-unsent', chatId: 'c1', deletedAt: new Date('2026-12-21T11:00:00Z'), deletedBy: 'sender' }),
    base({ id: 'm-expired', chatId: 'c1', expiresAt: new Date(Date.now() - 1000) }),
  ];
  h.edits = [];
  h.reports = [];
  h.reactionDeletes = [];
  h.published = [];
});

describe('the type', () => {
  it('is reportable and removable', () => {
    expect(REPORT_ENTITY_TYPES).toContain('dm');
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('dm');
  });
});

describe('filing a report', () => {
  it('a member reports another member’s direct message, and the report is about the sender', async () => {
    const res = await report('reader', 'm1');
    expect(res.status).toBe(200);
    expect(h.reports).toEqual([
      expect.objectContaining({ reporterId: 'reader', entityType: 'dm', entityId: 'm1', targetUserId: 'sender' }),
    ]);
  });

  it('a member of a group reports a group message', async () => {
    expect((await report('third', 'm-group')).status).toBe(200);
    expect(h.reports[0]).toMatchObject({ entityId: 'm-group', targetUserId: 'sender' });
  });

  it('a non-member is told the message does not exist, as for an unknown id', async () => {
    const stranger = await report('stranger', 'm1');
    const unknown = await report('stranger', 'nope');
    expect(stranger.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await stranger.json()).toEqual(await unknown.json());
    expect(h.reports).toHaveLength(0);
  });

  it('a member of one conversation cannot report a message of another', async () => {
    expect((await report('third', 'm1')).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });

  it('the sender cannot report their own message', async () => {
    expect((await report('sender', 'm1')).status).toBe(403);
    expect(h.reports).toHaveLength(0);
  });

  it.each(['m-system', 'm-unsent', 'm-expired'])('%s cannot be reported', async (id) => {
    expect((await report('reader', id)).status).toBe(404);
    expect(h.reports).toHaveLength(0);
  });
});

describe('the moderator’s view', () => {
  it('carries the message, its time, whether it was edited and its earlier versions, newest first', async () => {
    Object.assign(h.messages[0]!, { editedAt: new Date('2026-12-21T10:05:00Z'), content: 'something milder' });
    h.edits = [
      { messageId: 'm1', content: 'the first words', replacedAt: new Date('2026-12-21T10:02:00Z') },
      { messageId: 'm1', content: 'the second words', replacedAt: new Date('2026-12-21T10:04:00Z') },
      { messageId: 'other', content: 'not this message', replacedAt: new Date('2026-12-21T10:04:30Z') },
    ];
    const { dmReportViews } = await import('@/lib/messages/dm-reports.server');
    const { dmPreviewLine } = await import('@/lib/messages/dm-report');
    const views = await dmReportViews(['m1']);
    const view = views.get('m1')!;
    expect(view).toMatchObject({ conversation: 'direct', edited: true, removed: false, text: 'something milder' });
    expect(view.at).toBe('2026-12-21T10:00:00.000Z');
    expect(view.versions.map((v) => v.content)).toEqual(['the second words', 'the first words']);
    expect(dmPreviewLine(view)).toBe('Direct message · 2026-12-21 10:00 UTC (edited): something milder');
  });

  it('marks a group message, and shows an attachment only as a mark and its description', async () => {
    Object.assign(h.messages[1]!, { imageUrls: ['/api/feed/image/a.png'], imageAlts: ['A dog', ' '] });
    const { dmReportViews } = await import('@/lib/messages/dm-reports.server');
    const view = (await dmReportViews(['m-group'])).get('m-group')!;
    expect(view).toMatchObject({ conversation: 'group', hasImage: true, imageAlts: ['A dog'], edited: false });
    expect(JSON.stringify(view)).not.toContain('/api/feed/image');
  });

  it('still reads a message its sender unsent', async () => {
    const { dmReportViews } = await import('@/lib/messages/dm-reports.server');
    const view = (await dmReportViews(['m-unsent'])).get('m-unsent')!;
    expect(view).toMatchObject({ removed: true, text: 'the threat' });
  });

  it('is wired into the grouped queue and the flat queue (admin only)', () => {
    const root = join(__dirname, '..', '..', '..');
    const read = (p: string) => readFileSync(join(root, p), 'utf8');
    expect(read('lib/moderation/triage.server.ts')).toContain("groupKey('dm', id)");
    expect(read('lib/moderation/triage.server.ts')).toContain('dmReportViews');
    const flat = read('lib/admin/api/admin.reports.server.ts');
    expect(flat).toContain('dmReportViews');
    expect(flat).toContain("auth: 'admin'");
  });
});

describe('the takedown', () => {
  it('removes a direct message as a moderator and tells open threads', async () => {
    const { takeDownDmMessage } = await import('@/lib/messages/dm-reports.server');
    expect(await takeDownDmMessage('m1', NOW)).toEqual({ removed: true });
    expect(h.messages.find((m) => m.id === 'm1')).toMatchObject({ deletedAt: NOW, deletedBy: 'moderator' });
    expect(h.reactionDeletes).toEqual([{ messageId: 'm1' }]);
    expect(h.published).toHaveLength(1);
    expect(h.published[0]).toMatchObject({ type: 'message-deleted', row: { id: 'm1', conversationId: 'c1' } });
  });

  it('is idempotent, and leaves a message its sender already unsent as it is', async () => {
    const { takeDownDmMessage } = await import('@/lib/messages/dm-reports.server');
    await takeDownDmMessage('m1', NOW);
    expect(await takeDownDmMessage('m1', NOW)).toEqual({ removed: false });
    expect(await takeDownDmMessage('m-unsent', NOW)).toEqual({ removed: false });
    expect(h.messages.find((m) => m.id === 'm-unsent')).toMatchObject({ deletedBy: 'sender' });
    expect(h.published).toHaveLength(1);
  });

  it('deletes a group message outright (a group has no deleted-message row)', async () => {
    const { takeDownDmMessage } = await import('@/lib/messages/dm-reports.server');
    expect(await takeDownDmMessage('m-group', NOW)).toEqual({ removed: true });
    expect(h.messages.find((m) => m.id === 'm-group')).toBeUndefined();
    // Open group views are told, so they drop the line without a reload.
    expect(h.groupEvents).toEqual([
      {
        id: 'g1',
        payload: { type: 'chat-update', update: { kind: 'group', chatId: 'g1', op: 'removed', messageId: 'm-group' } },
      },
    ]);
  });

  it('a message already gone removes nothing', async () => {
    const { takeDownDmMessage } = await import('@/lib/messages/dm-reports.server');
    expect(await takeDownDmMessage('nope', NOW)).toEqual({ removed: false });
  });

  it('the moderator’s "remove content" decision reaches it', () => {
    const root = join(__dirname, '..', '..', '..');
    const triage = readFileSync(join(root, 'lib/moderation/triage.server.ts'), 'utf8');
    const body = triage.slice(triage.indexOf('async function takedownReportedContent'));
    expect(body).toContain("entityType === 'dm'");
    expect(body).toContain('takeDownDmMessage(entityId');
  });
});

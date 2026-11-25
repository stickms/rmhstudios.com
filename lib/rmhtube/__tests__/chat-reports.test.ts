import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s13-06: a member of an RMHTube room may report another member's message in it. A non-member, the author and an unknown
 * (or pruned) message id are all refused with the same answer, the moderator reads one message with its room and time,
 * and a takedown deletes the row and tells the hub through Redis.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  messages: [] as Row[],
  members: [] as Row[],
  publish: vi.fn((_channel: string, _data: unknown) => true),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rmhTubeChatMessage: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => h.messages.find((m) => m.id === where.id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        h.messages.filter((m) => where.id.in.includes(m.id as string)),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => {
        const before = h.messages.length;
        h.messages = h.messages.filter((m) => m.id !== where.id);
        return { count: before - h.messages.length };
      }),
    },
    rmhTubeRoomMember: {
      findUnique: vi.fn(async ({ where }: { where: { roomId_userId: { roomId: string; userId: string } } }) => {
        const key = where.roomId_userId;
        return h.members.find((m) => m.roomId === key.roomId && m.userId === key.userId) ?? null;
      }),
    },
  },
}));
vi.mock('@/lib/redis.server', () => ({ redisPublish: h.publish }));

import {
  CHAT_REMOVED_CHANNEL,
  chatMessageAuthor,
  chatPreviews,
  chatReportAuthor,
  takeDownChatMessage,
} from '@/lib/rmhtube/chat-reports.server';
import { REMOVABLE_REPORT_ENTITY_TYPES, REPORT_ENTITY_TYPES } from '@/lib/moderation/report-constants';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

beforeEach(() => {
  h.publish.mockClear();
  h.messages = [
    {
      id: 'm1',
      roomId: 'ROOM01',
      userId: 'author',
      userName: 'Author',
      content: 'a rude thing',
      createdAt: new Date('2026-11-20T14:03:09Z'),
      room: { name: 'Friday movies' },
    },
    {
      id: 'm2',
      roomId: 'ROOM02',
      userId: 'author',
      userName: 'Author',
      content: 'in an unnamed room',
      createdAt: new Date('2026-11-20T15:00:00Z'),
      room: { name: null },
    },
  ];
  h.members = [
    { roomId: 'ROOM01', userId: 'author' },
    { roomId: 'ROOM01', userId: 'viewer' },
  ];
});

describe('chatReportAuthor', () => {
  it('lets a member of the room report another member’s message', async () => {
    expect(await chatReportAuthor('m1', 'viewer')).toBe('author');
  });

  it('refuses a member of a different room, the same as an unknown id', async () => {
    expect(await chatReportAuthor('m1', 'stranger')).toBeNull();
    expect(await chatReportAuthor('m2', 'viewer')).toBeNull();
    expect(await chatReportAuthor('no-such-message', 'viewer')).toBeNull();
  });

  it('refuses the author reporting their own message', async () => {
    expect(await chatReportAuthor('m1', 'author')).toBeNull();
  });
});

describe('chatMessageAuthor', () => {
  it('names the author without a membership check, or null for a missing message', async () => {
    expect(await chatMessageAuthor('m1')).toBe('author');
    expect(await chatMessageAuthor('gone')).toBeNull();
  });
});

describe('chatPreviews', () => {
  it('is the message text with its room and time, nothing around it', async () => {
    const previews = await chatPreviews(['m1', 'm2', 'missing']);
    expect(previews.get('m1')).toBe('Room Friday movies · 2026-11-20 14:03 UTC: a rude thing');
    expect(previews.get('m2')).toBe('Room ROOM02 · 2026-11-20 15:00 UTC: in an unnamed room');
    expect(previews.has('missing')).toBe(false);
    expect(previews.size).toBe(2);
  });

  it('does no lookup for no ids', async () => {
    expect((await chatPreviews([])).size).toBe(0);
  });
});

describe('takeDownChatMessage', () => {
  it('deletes the row and publishes the room and message id on the hub channel', async () => {
    const res = await takeDownChatMessage('m1');
    expect(res).toEqual({ deleted: true, published: true });
    expect(h.messages.map((m) => m.id)).toEqual(['m2']);
    expect(h.publish).toHaveBeenCalledWith('rmhtube:chat:removed', { roomId: 'ROOM01', messageId: 'm1' });
    expect(CHAT_REMOVED_CHANNEL).toBe('rmhtube:chat:removed');
  });

  it('says the live room was not reached when Redis is off', async () => {
    h.publish.mockReturnValueOnce(false);
    expect(await takeDownChatMessage('m1')).toEqual({ deleted: true, published: false });
    expect(h.messages.map((m) => m.id)).toEqual(['m2']);
  });

  it('is a no-op for a message that is already gone', async () => {
    expect(await takeDownChatMessage('nope')).toEqual({ deleted: false, published: false });
    expect(h.publish).not.toHaveBeenCalled();
  });
});

describe('the report path wiring', () => {
  it('tube-chat is reportable and removable', () => {
    expect(REPORT_ENTITY_TYPES).toContain('tube-chat');
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('tube-chat');
  });

  it('the report route, triage and “Your reports” each handle it', () => {
    const route = read('lib/moderation/api/moderation.report.server.ts');
    expect(route).toContain('chatReportAuthor(entityId, session.user.id)');
    expect(route).toContain('chatMessageAuthor');
    const triage = read('lib/moderation/triage.server.ts');
    expect(triage).toContain('takeDownChatMessage(entityId)');
    expect(triage).toContain('chatPreviews(');
    expect(read('lib/moderation/my-reports.server.ts')).toContain("'tube-chat'");
    const panel = read('components/moderation/MyReportsPanel.tsx');
    expect(panel).toContain("t('kind-tube-chat'");
    expect(panel).toContain("t('gone-tube-chat'");
  });
});

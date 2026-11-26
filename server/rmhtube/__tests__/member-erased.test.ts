import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s15-18 (S13-06): the hub subscribes once to `rmhtube:member:erased`; the erased member's lines in a running room's
 * chat buffer, the pinned message, replies quoting them, their presence row and queue credits become "Deleted user",
 * their typing state is dropped, each affected room is told, and other members are untouched.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (data: unknown) => void>(),
  unsubscribed: [] as string[],
}));
vi.mock('../../../lib/redis.server', () => ({
  redisSubscribe: (channel: string, handler: (data: unknown) => void) => {
    h.handlers.set(channel, handler);
    return () => h.unsubscribed.push(channel);
  },
}));
vi.mock('../prisma-client', () => ({ getPrismaClient: () => ({}), disconnectPrisma: () => Promise.resolve() }));

import { RoomManager } from '../room-manager';
import { MEMBER_ERASED_CHANNEL, S2C } from '../../../lib/rmhtube/events';

const msg = (id: string, userId: string, userName: string, extra: Record<string, unknown> = {}) => ({
  id,
  userId,
  userName,
  content: `text ${id}`,
  createdAt: 1,
  replyToId: null,
  replyToContent: null,
  replyToUserName: null,
  mentions: [],
  timestamp: null,
  ...extra,
});

const member = (userId: string, userName: string) => ({
  userId,
  userName,
  avatarUrl: `https://img.test/${userId}.png`,
  isConnected: true,
});

function setup() {
  const emitted: { room: string; event: string; payload: { type?: string; payload?: unknown } }[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: never) => emitted.push({ room, event, payload }),
    }),
  };
  const rm = new RoomManager(io as never);
  const typing = setTimeout(() => {}, 60_000);
  const pinned = msg('p', 'gone', 'Gone Gail');
  const room = {
    id: 'ROOM01',
    seq: 0,
    chat: [
      msg('a', 'gone', 'Gone Gail'),
      msg('b', 'kept', 'Kept Kim'),
      msg('c', 'kept', 'Kept Kim', { replyToId: 'a', replyToContent: 'text a', replyToUserName: 'Gone Gail' }),
      msg('d', 'gone', 'Gone Gail', { replyToId: 'b', replyToContent: 'text b', replyToUserName: 'Kept Kim' }),
    ],
    pinnedMessage: pinned,
    members: new Map([
      ['gone', member('gone', 'Gone Gail')],
      ['kept', member('kept', 'Kept Kim')],
    ]),
    queue: [{ id: 'q1', addedBy: 'gone', addedByName: 'Gone Gail' }],
    playedItems: [{ id: 'q0', addedBy: 'kept', addedByName: 'Kept Kim' }],
    currentItem: null,
    bannedUsers: [{ userId: 'gone', userName: 'Gone Gail' }],
    typingTimers: new Map([['gone', typing]]),
  };
  const other = {
    id: 'ROOM02',
    seq: 0,
    chat: [msg('z', 'kept', 'Kept Kim')],
    pinnedMessage: null,
    members: new Map([['kept', member('kept', 'Kept Kim')]]),
    queue: [],
    playedItems: [],
    currentItem: null,
    bannedUsers: [],
    typingTimers: new Map(),
  };
  rm.rooms.set('ROOM01', room as never);
  rm.rooms.set('ROOM02', other as never);
  return { rm, room, other, emitted };
}

beforeEach(() => {
  h.handlers.clear();
  h.unsubscribed = [];
});

describe('the erased-member subscription', () => {
  it('subscribes once at construction and renames the member in a running room', () => {
    const { room, emitted } = setup();
    const handler = h.handlers.get(MEMBER_ERASED_CHANNEL);
    expect(MEMBER_ERASED_CHANNEL).toBe('rmhtube:member:erased');
    expect(handler).toBeTypeOf('function');
    handler!({ userId: 'gone' });

    expect(room.chat.map((m) => m.userName)).toEqual(['Deleted user', 'Kept Kim', 'Kept Kim', 'Deleted user']);
    expect(room.pinnedMessage?.userName).toBe('Deleted user');
    expect(room.members.get('gone')).toMatchObject({ userName: 'Deleted user', avatarUrl: null });
    expect(room.queue[0]).toMatchObject({ addedByName: 'Deleted user' });
    expect(room.bannedUsers[0]).toMatchObject({ userName: 'Deleted user' });
    expect(room.typingTimers.has('gone')).toBe(false);
    // The reply that quotes the erased member loses the name; the one quoting somebody else keeps it.
    expect(room.chat[2]!.replyToUserName).toBe('Deleted user');
    expect(room.chat[3]!.replyToUserName).toBe('Kept Kim');
    expect(emitted).toEqual([
      {
        room: 'ROOM01',
        event: S2C.ROOM_ACTION,
        payload: expect.objectContaining({
          type: 'MEMBER_ERASED',
          payload: { userId: 'gone', userName: 'Deleted user' },
        }),
      },
    ]);
  });

  it('leaves other members and rooms that never held the member untouched', () => {
    const { room, other, emitted } = setup();
    h.handlers.get(MEMBER_ERASED_CHANNEL)!({ userId: 'gone' });
    expect(room.chat[1]!.userName).toBe('Kept Kim');
    expect(room.members.get('kept')).toMatchObject({ userName: 'Kept Kim', avatarUrl: 'https://img.test/kept.png' });
    expect(room.playedItems[0]).toMatchObject({ addedByName: 'Kept Kim' });
    expect(other.chat[0]!.userName).toBe('Kept Kim');
    expect(other.seq).toBe(0);
    expect(emitted.every((e) => e.room === 'ROOM01')).toBe(true);
  });

  it('is idempotent and ignores a malformed payload', () => {
    const { rm, emitted } = setup();
    const handler = h.handlers.get(MEMBER_ERASED_CHANNEL)!;
    handler({ userId: 'gone' });
    handler({ userId: 'gone' });
    handler({ nope: true });
    handler(null);
    expect(emitted).toHaveLength(1);
    expect(rm.eraseMemberName('gone')).toBe(0);
  });

  it('unsubscribes at shutdown', () => {
    const { rm } = setup();
    rm.stopGarbageCollector();
    expect(h.unsubscribed).toContain(MEMBER_ERASED_CHANNEL);
  });
});

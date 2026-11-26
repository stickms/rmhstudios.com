import { describe, expect, it } from 'vitest';
import { applyRoomAction } from '@/lib/rmhtube/store';
import type { ChatMessage, ClientQueueItem, ClientRoomState } from '@/lib/rmhtube/types';

/**
 * s15-18 (S13-06): the client side of `MEMBER_ERASED`. Every name the hub renames is renamed in the open room too
 * (members, chat, pin, reply quotes, queue credits, ban list) and the member's typing state goes; others are untouched.
 */

const line = (id: string, userId: string, userName: string, reply?: Partial<ChatMessage>): ChatMessage =>
  ({
    id,
    userId,
    userName,
    content: 'hi',
    createdAt: 1,
    replyToId: null,
    replyToContent: null,
    replyToUserName: null,
    mentions: [],
    reactions: {},
    ...reply,
  }) as ChatMessage;

const item = (id: string, addedBy: string, addedByName: string): ClientQueueItem =>
  ({ id, addedBy, addedByName }) as ClientQueueItem;

const room = {
  members: [
    { userId: 'gone', userName: 'Alice', avatarUrl: 'https://cdn.example/a.png' },
    { userId: 'stay', userName: 'Bob', avatarUrl: null },
  ],
  chat: [
    line('c1', 'gone', 'Alice'),
    line('c2', 'stay', 'Bob', { replyToId: 'c1', replyToContent: 'hi', replyToUserName: 'Alice' }),
  ],
  pinnedMessage: line('c1', 'gone', 'Alice'),
  queue: [item('q1', 'gone', 'Alice'), item('q2', 'stay', 'Bob')],
  currentItem: item('q0', 'gone', 'Alice'),
  playedItems: [item('p1', 'gone', 'Alice')],
  bannedUsers: [{ userId: 'gone', userName: 'Alice', bannedAt: 1, bannedBy: 'stay', reason: null }],
  typingUsers: ['gone', 'stay'],
} as unknown as ClientRoomState;

describe('MEMBER_ERASED on the client', () => {
  it('renames the erased member everywhere the room shows a name, and leaves others alone', () => {
    const next = applyRoomAction(room, {
      type: 'MEMBER_ERASED',
      payload: { userId: 'gone', userName: 'Deleted user' },
      seq: 2,
      timestamp: 2,
    });
    expect(next.members).toEqual([
      { userId: 'gone', userName: 'Deleted user', avatarUrl: null },
      { userId: 'stay', userName: 'Bob', avatarUrl: null },
    ]);
    expect(next.chat.map((m) => [m.userName, m.replyToUserName])).toEqual([
      ['Deleted user', null],
      ['Bob', 'Deleted user'],
    ]);
    expect(next.pinnedMessage?.userName).toBe('Deleted user');
    expect(next.queue.map((q) => q.addedByName)).toEqual(['Deleted user', 'Bob']);
    expect(next.currentItem?.addedByName).toBe('Deleted user');
    expect(next.playedItems[0]!.addedByName).toBe('Deleted user');
    expect(next.bannedUsers[0]!.userName).toBe('Deleted user');
    expect(next.typingUsers).toEqual(['stay']);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s13-06: the hub subscribes once to `rmhtube:chat:removed`; a removed message leaves the room's ring buffer, its
 * reactions and pin, replies to it stop quoting it, and every client is told. An unknown room is a no-op.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (data: unknown) => void>(),
}));
vi.mock('../../../lib/redis.server', () => ({
  redisSubscribe: (channel: string, handler: (data: unknown) => void) => {
    h.handlers.set(channel, handler);
    return () => {};
  },
}));
vi.mock('../prisma-client', () => ({ getPrismaClient: () => ({}) }));

import { ChatHandler } from '../chat-handler';
import { S2C } from '../../../lib/rmhtube/events';

const msg = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  userId: 'u1',
  userName: 'U One',
  content: `text ${id}`,
  createdAt: 1,
  replyToId: null,
  replyToContent: null,
  replyToUserName: null,
  mentions: [],
  timestamp: null,
  ...extra,
});

function setup() {
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  const io = {
    to: (room: string) => ({ emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }) }),
  };
  const room = {
    id: 'ROOM01',
    chat: [msg('a'), msg('b'), msg('c', { replyToId: 'b', replyToContent: 'text b', replyToUserName: 'U One' })],
    chatReactions: new Map([['b', new Map([['👍', new Set(['u2'])]])]]),
    pinnedMessage: null as ReturnType<typeof msg> | null,
  };
  const broadcastAction = vi.fn();
  const roomManager = { rooms: new Map([['ROOM01', room]]), broadcastAction };
  const handler = new ChatHandler(io as never, roomManager as never);
  return { handler, room, emitted, broadcastAction };
}

beforeEach(() => h.handlers.clear());

describe('ChatHandler.removeMessage', () => {
  it('drops the message from the buffer and emits the event to the room', () => {
    const { handler, room, emitted } = setup();
    expect(handler.removeMessage('ROOM01', 'b')).toBe(true);
    expect(room.chat.map((m) => m.id)).toEqual(['a', 'c']);
    expect(room.chatReactions.has('b')).toBe(false);
    expect(emitted).toEqual([{ room: 'ROOM01', event: S2C.CHAT_REMOVED, payload: { messageId: 'b' } }]);
    expect(S2C.CHAT_REMOVED).toBe('rmhtube:chat:removed');
  });

  it('stops a reply quoting the removed message and marks it removed', () => {
    const { handler, room } = setup();
    handler.removeMessage('ROOM01', 'b');
    const reply = room.chat.find((m) => m.id === 'c')!;
    expect(reply).toMatchObject({ replyToId: 'b', replyToContent: null, replyToUserName: null, replyToRemoved: true });
  });

  it('unpins a removed pinned message', () => {
    const { handler, room, broadcastAction } = setup();
    room.pinnedMessage = room.chat[1]!;
    handler.removeMessage('ROOM01', 'b');
    expect(room.pinnedMessage).toBeNull();
    expect(broadcastAction).toHaveBeenCalledWith(room, 'MESSAGE_UNPINNED', {});
  });

  it('is a no-op for a room that is not running', () => {
    const { handler, room, emitted } = setup();
    expect(handler.removeMessage('NOROOM', 'b')).toBe(false);
    expect(room.chat).toHaveLength(3);
    expect(emitted).toEqual([]);
  });
});

describe('the Redis subscription', () => {
  it('subscribes once at construction and routes a valid payload to the room', () => {
    const { room, emitted } = setup();
    const handler = h.handlers.get('rmhtube:chat:removed');
    expect(handler).toBeTypeOf('function');
    handler!({ roomId: 'ROOM01', messageId: 'a' });
    expect(room.chat.map((m) => m.id)).toEqual(['b', 'c']);
    expect(emitted).toHaveLength(1);
  });

  it('ignores a malformed payload', () => {
    const { room, emitted } = setup();
    const handler = h.handlers.get('rmhtube:chat:removed')!;
    handler({ roomId: 5 });
    handler(null);
    handler('x');
    expect(room.chat).toHaveLength(3);
    expect(emitted).toEqual([]);
  });
});

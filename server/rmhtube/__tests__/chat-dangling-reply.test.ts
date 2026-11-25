import { describe, expect, it, vi } from 'vitest';

/**
 * s14-20 (c): a reply drafted to a message a moderator then removes. The composer's target is dropped once the message
 * leaves the room (`liveReplyTarget`), and the hub sends a `replyToId` that is not in the room as a plain message.
 */
vi.mock('../../../lib/redis.server', () => ({ redisSubscribe: () => () => {} }));
vi.mock('../prisma-client', () => ({ getPrismaClient: () => ({}) }));

import { ChatHandler } from '../chat-handler';
import { liveReplyTarget } from '../../../lib/rmhtube/utils';

describe('liveReplyTarget', () => {
  const target = { id: 'b', userName: 'U' };
  it('keeps a target that is still in the room', () => {
    expect(liveReplyTarget(target, [{ id: 'a' }, { id: 'b' }])).toBe(target);
  });
  it('drops a target the room no longer has', () => {
    expect(liveReplyTarget(target, [{ id: 'a' }])).toBeNull();
  });
  it('is null with no target or no room', () => {
    expect(liveReplyTarget(null, [{ id: 'a' }])).toBeNull();
    expect(liveReplyTarget(target, undefined)).toBeNull();
  });
});

type Msg = { id: string; content: string; userName: string; replyToId: string | null; replyToContent: string | null };

describe('ChatHandler with a dangling replyToId', () => {
  async function send(replyToId: string | undefined, chat: Msg[]) {
    const broadcast = vi.fn();
    const room = { id: 'ROOM01', hostUserId: 'host', chat, lastActivityAt: 0 };
    const roomManager = { rooms: new Map([['ROOM01', room]]), getRoomForUser: () => room, broadcastAction: broadcast };
    const handler = new ChatHandler({ to: () => ({ emit: vi.fn() }) } as never, roomManager as never);
    const internals = handler as unknown as {
      slowMode: { check: () => Promise<{ ok: true }> };
      chatWriter: { add: () => void };
      onChat: (socket: unknown, payload: { content: string; replyToId?: string }) => Promise<void>;
    };
    internals.slowMode = { check: async () => ({ ok: true }) };
    internals.chatWriter = { add: () => undefined };
    const socket = { data: { userId: 'u1', userName: 'U One' }, emit: vi.fn() };
    await internals.onChat(socket, { content: 'hello', replyToId });
    return broadcast.mock.calls[0]?.[2] as Msg;
  }

  it('sends a reply to a removed message as a plain message', async () => {
    const sent = await send('gone', [{ id: 'a', content: 'x', userName: 'U', replyToId: null, replyToContent: null }]);
    expect(sent.content).toBe('hello');
    expect(sent.replyToId).toBeNull();
    expect(sent.replyToContent).toBeNull();
  });

  it('still quotes a message that is in the room', async () => {
    const sent = await send('a', [{ id: 'a', content: 'x', userName: 'U', replyToId: null, replyToContent: null }]);
    expect(sent.replyToId).toBe('a');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s14-17: a member a moderator timed out of messages and chats cannot talk in an RMHTube room: the line is refused
 * with the hub's error event, and it is not buffered, broadcast, counted or saved. Another member still can.
 */

const h = vi.hoisted(() => ({
  rows: [] as { userId: string; feature: string; expiresAt: Date | null }[],
  fail: false,
  reads: 0,
}));

vi.mock('../../../lib/redis.server', () => ({ redisSubscribe: () => () => {} }));
vi.mock('../prisma-client', async () => {
  const { shapeChecked } = await import('../../../lib/db/query-shape');
  return {
    getPrismaClient: () =>
      shapeChecked({
        featureRestriction: {
          findMany: async (args: { where: { userId: string } }) => {
            h.reads++;
            if (h.fail) throw new Error('db down');
            return h.rows
              .filter((r) => r.userId === args.where.userId && (r.expiresAt === null || r.expiresAt > new Date()))
              .map((r) => ({ feature: r.feature, expiresAt: r.expiresAt }));
          },
        },
      }),
  };
});

import { ChatHandler } from '../chat-handler';
import { S2C } from '../../../lib/rmhtube/events';
import { clearRestrictionCache } from '../../../lib/moderation/restrictions-core';
import { resetRestrictionFailOpen } from '../../shared/member-restrictions';

function setup() {
  const room = {
    id: 'ROOM01',
    hostUserId: 'host',
    chat: [] as unknown[],
    members: new Map<string, unknown>(),
    lastActivityAt: 0,
  };
  const broadcastAction = vi.fn();
  const roomManager = { rooms: new Map([['ROOM01', room]]), getRoomForUser: () => room, broadcastAction };
  const handler = new ChatHandler({ to: () => ({ emit: () => {} }) } as never, roomManager as never);
  const emitted: { event: string; payload: unknown }[] = [];
  const socketFor = (userId: string) => ({
    data: { userId, userName: userId },
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
  });
  const send = (userId: string, content: string) =>
    (handler as unknown as { onChat(s: unknown, p: { content: string }): Promise<void> }).onChat(socketFor(userId), {
      content,
    });
  return { room, broadcastAction, emitted, send };
}

beforeEach(() => {
  h.rows = [];
  h.fail = false;
  clearRestrictionCache();
  resetRestrictionFailOpen();
});

describe('RMHTube room chat under a timeout', () => {
  it('refuses a timed-out member: error event to them, nothing kept or broadcast', async () => {
    h.rows = [{ userId: 'u1', feature: 'message', expiresAt: new Date(Date.now() + 86_400_000) }];
    const { room, broadcastAction, emitted, send } = setup();
    await send('u1', 'hello room');
    expect(room.chat).toHaveLength(0);
    expect(broadcastAction).not.toHaveBeenCalled();
    expect(emitted).toEqual([{ event: S2C.ERROR, payload: expect.objectContaining({ code: 'FEATURE_RESTRICTED' }) }]);
  });

  it('lets a member who is not timed out talk, and a member timed out of something else', async () => {
    h.rows = [{ userId: 'u2', feature: 'post', expiresAt: null }];
    const { room, broadcastAction, emitted, send } = setup();
    await send('u1', 'hello room');
    await send('u2', 'me too');
    expect(room.chat).toHaveLength(2);
    expect(broadcastAction).toHaveBeenCalledTimes(2);
    expect(emitted).toEqual([]);
  });

  it('lets the line through when the timeout cannot be read (the web tier still enforces it)', async () => {
    h.fail = true;
    const { room, send } = setup();
    await send('u1', 'still works');
    expect(room.chat).toHaveLength(1);
  });

  it('after a failed read, lets lines through without asking again for a while (one read, not one per line)', async () => {
    h.fail = true;
    h.reads = 0;
    const { room, send } = setup();
    await send('u1', 'one');
    await send('u2', 'two');
    await send('u1', 'three');
    expect(room.chat).toHaveLength(3);
    expect(h.reads).toBe(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s14-17: a member a moderator timed out of messages and chats cannot talk in an RMHBox lobby: the line is refused
 * with the hub's error event and is not kept or broadcast. Another member still can.
 */

const h = vi.hoisted(() => ({
  rows: [] as { userId: string; feature: string; expiresAt: Date | null }[],
  fail: false,
}));

vi.mock('../prisma-client', async () => {
  const { shapeChecked } = await import('../../../lib/db/query-shape');
  return {
    getPrismaClient: () =>
      shapeChecked({
        featureRestriction: {
          findMany: async (args: { where: { userId: string } }) => {
            if (h.fail) throw new Error('db down');
            return h.rows
              .filter((r) => r.userId === args.where.userId && (r.expiresAt === null || r.expiresAt > new Date()))
              .map((r) => ({ feature: r.feature, expiresAt: r.expiresAt }));
          },
        },
      }),
  };
});

import { ChatHandler } from '../chat';
import { S2C } from '../../../lib/rmhbox/events';
import { clearRestrictionCache } from '../../../lib/moderation/restrictions-core';
import { resetRestrictionFailOpen } from '../../shared/member-restrictions';

function setup() {
  const lobby = {
    id: 'LOBBY1',
    chat: [] as unknown[],
    players: new Map([
      ['u1', {}],
      ['u2', {}],
    ]),
    spectators: new Map<string, unknown>(),
    lastActivityAt: 0,
  };
  const broadcastAction = vi.fn();
  const lobbyManager = { getLobbyByUserId: () => lobby, broadcastAction };
  const handler = new ChatHandler({} as never, lobbyManager as never);
  const emitted: { event: string; payload: unknown }[] = [];
  const socketFor = (userId: string) => ({
    id: `socket-${userId}`,
    data: { userId, userName: userId },
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
  });
  const send = (userId: string, content: string) =>
    (handler as unknown as { onChat(s: unknown, p: { lobbyId: string; content: string }): Promise<void> }).onChat(
      socketFor(userId),
      { lobbyId: 'LOBBY1', content },
    );
  return { lobby, broadcastAction, emitted, send };
}

beforeEach(() => {
  h.rows = [];
  h.fail = false;
  clearRestrictionCache();
  resetRestrictionFailOpen();
});

describe('RMHBox lobby chat under a timeout', () => {
  it('refuses a timed-out member: error event to them, nothing kept or broadcast', async () => {
    h.rows = [{ userId: 'u1', feature: 'message', expiresAt: new Date(Date.now() + 86_400_000) }];
    const { lobby, broadcastAction, emitted, send } = setup();
    await send('u1', 'hello lobby');
    expect(lobby.chat).toHaveLength(0);
    expect(broadcastAction).not.toHaveBeenCalled();
    expect(emitted).toEqual([{ event: S2C.ERROR, payload: expect.objectContaining({ code: 'FEATURE_RESTRICTED' }) }]);
  });

  it('lets a member who is not timed out talk, and one timed out of something else', async () => {
    h.rows = [{ userId: 'u2', feature: 'comment', expiresAt: null }];
    const { lobby, broadcastAction, emitted, send } = setup();
    await send('u1', 'hello lobby');
    await send('u2', 'me too');
    expect(lobby.chat).toHaveLength(2);
    expect(broadcastAction).toHaveBeenCalledTimes(2);
    expect(emitted).toEqual([]);
  });

  it('lets the line through when the timeout cannot be read (the web tier still enforces it)', async () => {
    h.fail = true;
    const { lobby, send } = setup();
    await send('u1', 'still works');
    expect(lobby.chat).toHaveLength(1);
  });
});

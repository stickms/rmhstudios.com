import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s14-17: a member a moderator timed out of messages and chats cannot talk in an RMHStudy room: the line is refused
 * with the hub's error event (to them only) and is not stored or sent to the room. Everyone else still can.
 */

const h = vi.hoisted(() => ({
  rows: [] as { userId: string; feature: string; expiresAt: Date | null }[],
  fail: false,
}));

vi.mock('../../prisma-client', async () => {
  const { shapeChecked } = await import('../../../../lib/db/query-shape');
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
vi.mock('../../economy', () => ({ awardAppProgress: vi.fn() }));

import { registerRmhStudyHandlers } from '../rmhstudy';
import { clearRestrictionCache } from '../../../../lib/moderation/restrictions-core';
import { resetRestrictionFailOpen } from '../../../shared/member-restrictions';

type Handler = (payload?: unknown) => unknown;

interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  handlers: Map<string, Handler>;
  emitted: { event: string; payload: unknown }[];
  on: (event: string, h: Handler) => void;
  emit: (event: string, payload?: unknown) => void;
  join: () => void;
  leave: () => void;
}

const sockets = new Map<string, FakeSocket>();
const roomEmits: { event: string; payload: unknown }[] = [];
const io = {
  sockets: { sockets },
  to: () => ({ emit: (event: string, payload?: unknown) => roomEmits.push({ event, payload }) }),
} as never;

function connect(id: string, userName: string): FakeSocket {
  const s: FakeSocket = {
    id,
    data: { userId: id, userName },
    handlers: new Map(),
    emitted: [],
    on: (event, handler) => void s.handlers.set(event, handler),
    emit: (event, payload) => void s.emitted.push({ event, payload }),
    join: () => undefined,
    leave: () => undefined,
  };
  sockets.set(id, s);
  registerRmhStudyHandlers(io, s as never);
  return s;
}

const call = (s: FakeSocket, event: string, payload?: unknown) => s.handlers.get(event)?.(payload);
const chatLines = () => roomEmits.filter((e) => e.event === 'rmhstudy:room:chat').map((e) => e.payload);

let seq = 0;
function newRoom() {
  seq++;
  const host = connect(`host${seq}`, 'Host');
  const guest = connect(`guest${seq}`, 'Guest');
  call(host, 'rmhstudy:room:create', { settings: {} });
  const state = host.emitted.find((e) => e.event === 'rmhstudy:room:state')?.payload as { roomCode: string };
  call(guest, 'rmhstudy:room:join', { roomCode: state.roomCode });
  return { host, guest, code: state.roomCode };
}

const say = async (s: FakeSocket, roomCode: string, message: string) => {
  await call(s, 'rmhstudy:room:chat', { roomCode, message });
};

beforeEach(() => {
  h.rows = [];
  h.fail = false;
  roomEmits.length = 0;
  clearRestrictionCache();
  resetRestrictionFailOpen();
});

describe('RMHStudy room chat under a timeout', () => {
  it('refuses a timed-out member, tells only them, and sends nothing to the room', async () => {
    const { host, guest, code } = newRoom();
    h.rows = [{ userId: guest.id, feature: 'message', expiresAt: new Date(Date.now() + 86_400_000) }];
    await say(guest, code, 'hello everyone');
    expect(chatLines()).toHaveLength(0);
    const err = guest.emitted.find((e) => e.event === 'rmhstudy:error')?.payload as { code?: string; message: string };
    expect(err?.code).toBe('FEATURE_RESTRICTED');
    expect(err?.message).toContain('restricted on your account');
    expect(host.emitted.some((e) => e.event === 'rmhstudy:error')).toBe(false);
  });

  it('lets a member who is not timed out talk, and one timed out of something else', async () => {
    const { host, guest, code } = newRoom();
    h.rows = [{ userId: guest.id, feature: 'post', expiresAt: null }];
    await say(host, code, 'welcome');
    await say(guest, code, 'thanks');
    expect(chatLines()).toHaveLength(2);
  });

  it('lets the line through when the timeout cannot be read (the web tier still enforces it)', async () => {
    const { guest, code } = newRoom();
    h.fail = true;
    await say(guest, code, 'still works');
    expect(chatLines()).toHaveLength(1);
  });
});

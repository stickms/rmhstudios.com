import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { SPACE_C2S, SPACE_S2C } from '../../../../lib/spaces/events';
import { registerSpacesHandlers } from '../spaces';

const mocks = vi.hoisted(() => ({
  prisma: {
    space: { findUnique: vi.fn() },
    communityMember: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../prisma-client', () => ({ getPrismaClient: () => mocks.prisma }));
vi.mock('../../logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('../../rate-limit', () => ({ checkRateLimit: () => true }));

function connect(userId?: string) {
  const handlers = new Map<string, (p: unknown) => Promise<void> | void>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const joined: string[] = [];
  const socket = {
    id: `sock-${Math.random()}`,
    data: userId ? { userId } : {},
    on: (e: string, h: (p: unknown) => Promise<void> | void) => handlers.set(e, h),
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
    join: (r: string) => joined.push(r),
    leave: () => {},
  } as unknown as Socket;
  const io = { to: () => ({ emit: vi.fn() }) } as unknown as Server;
  registerSpacesHandlers(io, socket);
  return { join: (id: string) => handlers.get(SPACE_C2S.JOIN)!({ spaceId: id }), emitted, joined };
}

const spaceRow = (id: string, isPrivate: boolean | null) => ({
  id,
  hostId: 'host',
  status: 'LIVE',
  recordChat: true,
  pinned: null,
  communityId: isPrivate === null ? null : 'c1',
  community: isPrivate === null ? null : { isPrivate },
});

describe('space:join on a private community Space', () => {
  beforeEach(() => {
    mocks.prisma.space.findUnique.mockReset();
    mocks.prisma.communityMember.findUnique.mockReset();
  });

  it('rejects anonymous sockets', async () => {
    mocks.prisma.space.findUnique.mockResolvedValue(spaceRow('priv-anon', true));
    const c = connect();
    await c.join('priv-anon');
    expect(c.joined).toEqual([]);
    expect(c.emitted[0]?.event).toBe(SPACE_S2C.ERROR);
  });

  it('rejects signed-in non-members', async () => {
    mocks.prisma.space.findUnique.mockResolvedValue(spaceRow('priv-non', true));
    mocks.prisma.communityMember.findUnique.mockResolvedValue(null);
    const c = connect('u1');
    await c.join('priv-non');
    expect(c.joined).toEqual([]);
    expect(c.emitted[0]?.event).toBe(SPACE_S2C.ERROR);
  });

  it('admits members', async () => {
    mocks.prisma.space.findUnique.mockResolvedValue(spaceRow('priv-mem', true));
    mocks.prisma.communityMember.findUnique.mockResolvedValue({ userId: 'u2' });
    const c = connect('u2');
    await c.join('priv-mem');
    expect(c.joined).toEqual(['space:priv-mem']);
  });

  it('still admits anonymous sockets to public and profile Spaces', async () => {
    mocks.prisma.space.findUnique.mockResolvedValue(spaceRow('pub-comm', false));
    const a = connect();
    await a.join('pub-comm');
    mocks.prisma.space.findUnique.mockResolvedValue(spaceRow('profile', null));
    const b = connect();
    await b.join('profile');
    expect(a.joined).toEqual(['space:pub-comm']);
    expect(b.joined).toEqual(['space:profile']);
  });
});

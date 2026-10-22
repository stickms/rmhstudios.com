import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { GCALL_C2S, GCALL_S2C } from '../../../../lib/groupcall/events';
import { claimBusy, getBusy, releaseBusy } from '../../busy-registry';
import {
  GROUP_CALL_SEAT_GRACE_MS,
  __liveGroupCallCount,
  evictOriginMember,
  handleGroupCallDisconnect,
  registerGroupCallHandlers,
} from '../group-call';

const mocks = vi.hoisted(() => ({
  prisma: {
    communityMember: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    userBlock: { findMany: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
    follow: { findMany: vi.fn() },
    groupCall: { create: vi.fn(), update: vi.fn() },
    groupCallParticipant: { upsert: vi.fn() },
  },
}));

vi.mock('../../prisma-client', () => ({
  getPrismaClient: () => mocks.prisma,
}));

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../rate-limit', () => ({
  checkRateLimit: () => true,
}));

vi.mock('../party', () => ({
  isPartyMember: vi.fn(),
  onPartyMemberRemoved: vi.fn(),
}));

type Handler = (payload: Record<string, unknown>) => Promise<void> | void;

interface FakeClient {
  socket: Socket;
  emitted: Array<{ event: string; payload: Record<string, unknown> }>;
  send: (event: string, payload: Record<string, unknown>) => Promise<void> | void;
}

const io = {
  to: () => ({ emit: () => {} }),
  // Everyone is online, so invitee screening admits on privacy alone.
  in: () => ({ socketsLeave: () => {}, fetchSockets: async () => [{ id: 'online' }] }),
  sockets: { sockets: new Map<string, Socket>() },
} as unknown as Server;

function connect(userId: string, socketId = `${userId}-socket`): FakeClient {
  const handlers = new Map<string, Handler>();
  const emitted: FakeClient['emitted'] = [];
  const socket = {
    id: socketId,
    data: { userId, userName: userId },
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    emit: (event: string, payload: Record<string, unknown>) => emitted.push({ event, payload }),
    join: () => {},
    leave: () => {},
  } as unknown as Socket;
  (io.sockets.sockets as Map<string, Socket>).set(socketId, socket);
  registerGroupCallHandlers(io, socket);
  return {
    socket,
    emitted,
    send: (event, payload) => {
      const handler = handlers.get(event);
      if (!handler) throw new Error(`no handler for ${event}`);
      return handler(payload);
    },
  };
}

/** A promise whose resolution the test controls. */
function gate<T>(): { promise: Promise<T>; open: (value: T) => void } {
  let open!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** Peer-row lookups that hang for the listed users until released. */
function holdPeerRows(held: Map<string, Promise<unknown>>): void {
  mocks.prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    held.get(where.id) ?? Promise.resolve({ id: where.id, name: where.id, image: null, handle: null }),
  );
}

const joinedCallId = (client: FakeClient): string | undefined =>
  client.emitted.find((e) => e.event === GCALL_S2C.JOINED)?.payload.callId as string | undefined;

describe('group-call admission races', () => {
  beforeEach(() => {
    mocks.prisma.communityMember.findUnique.mockReset().mockResolvedValue({ userId: 'member' });
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.user.findMany
      .mockReset()
      .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id, name: id, image: null, handle: null }))),
      );
    mocks.prisma.userBlock.findMany.mockReset().mockResolvedValue([]);
    mocks.prisma.notificationPreference.findMany
      .mockReset()
      .mockImplementation(({ where }: { where: { userId: { in: string[] } } }) =>
        Promise.resolve(where.userId.in.map((userId) => ({ userId, callPrivacy: 'everyone' }))),
      );
    mocks.prisma.follow.findMany.mockReset().mockResolvedValue([]);
    mocks.prisma.groupCall.create.mockReset().mockResolvedValue({});
    mocks.prisma.groupCall.update.mockReset().mockResolvedValue({});
    mocks.prisma.groupCallParticipant.upsert.mockReset().mockResolvedValue({});
  });

  it('does not leave a joiner busy when the room ends while their peer row loads', async () => {
    holdPeerRows(new Map());
    const host = connect('race-host');
    await host.send(GCALL_C2S.START, { origin: 'community', originId: 'community-a' });
    const callId = joinedCallId(host);
    expect(callId).toBeDefined();

    const joinerRow = gate<unknown>();
    holdPeerRows(new Map([['race-joiner', joinerRow.promise]]));
    const joiner = connect('race-joiner');
    const joining = joiner.send(GCALL_C2S.JOIN, { callId });
    // Let membership resolve so the join is parked on the peer row.
    await new Promise((resolve) => setTimeout(resolve, 0));

    await host.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);

    joinerRow.open({ id: 'race-joiner', name: 'Joiner', image: null, handle: null });
    await joining;

    expect(joiner.emitted).toContainEqual({
      event: GCALL_S2C.REJECTED,
      payload: expect.objectContaining({ reason: 'gone', operation: 'join', callId }),
    });
    expect(joiner.emitted.some((e) => e.event === GCALL_S2C.JOINED)).toBe(false);
    expect(getBusy('race-joiner')).toBeNull();
    expect(getBusy('race-host')).toBeNull();
  });

  it('opens one room when two members start the same community room at once', async () => {
    const firstRow = gate<unknown>();
    const secondRow = gate<unknown>();
    holdPeerRows(
      new Map([
        ['starter-one', firstRow.promise],
        ['starter-two', secondRow.promise],
      ]),
    );
    const one = connect('starter-one');
    const two = connect('starter-two');

    const startOne = one.send(GCALL_C2S.START, { origin: 'community', originId: 'community-b' });
    const startTwo = two.send(GCALL_C2S.START, { origin: 'community', originId: 'community-b' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    firstRow.open({ id: 'starter-one', name: 'One', image: null, handle: null });
    await startOne;
    secondRow.open({ id: 'starter-two', name: 'Two', image: null, handle: null });
    await startTwo;

    expect(__liveGroupCallCount()).toBe(1);
    const callId = joinedCallId(one);
    expect(callId).toBeDefined();
    expect(joinedCallId(two)).toBe(callId);
    expect(getBusy('starter-one')).toEqual({ kind: 'gcall', id: callId });
    expect(getBusy('starter-two')).toEqual({ kind: 'gcall', id: callId });

    await one.send(GCALL_C2S.LEAVE, { callId });
    await two.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('does not ring an invitee who was claimed by another call during screening', async () => {
    const hostRow = gate<unknown>();
    holdPeerRows(new Map([['adhoc-host', hostRow.promise]]));
    const host = connect('adhoc-host');
    const starting = host.send(GCALL_C2S.START, { origin: 'adhoc', inviteeIds: ['adhoc-callee'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Another room rings (and claims) the callee while this START is parked.
    expect(claimBusy('adhoc-callee', 'gcall', 'other-room')).toBe(true);
    hostRow.open({ id: 'adhoc-host', name: 'Host', image: null, handle: null });
    await starting;

    expect(host.emitted).toContainEqual({
      event: GCALL_S2C.REJECTED,
      payload: expect.objectContaining({ reason: 'busy', operation: 'start' }),
    });
    expect(__liveGroupCallCount()).toBe(0);
    expect(getBusy('adhoc-host')).toBeNull();
    expect(getBusy('adhoc-callee')).toEqual({ kind: 'gcall', id: 'other-room' });
    releaseBusy('adhoc-callee', 'other-room');
  });

  it('does not bind a socket that disconnected while its START was in flight', async () => {
    const row = gate<unknown>();
    holdPeerRows(new Map([['vanishing-host', row.promise]]));
    const host = connect('vanishing-host');
    const starting = host.send(GCALL_C2S.START, { origin: 'community', originId: 'community-c' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    (host.socket as unknown as { disconnected: boolean }).disconnected = true;
    row.open({ id: 'vanishing-host', name: 'Gone', image: null, handle: null });
    await starting;

    expect(__liveGroupCallCount()).toBe(0);
    expect(getBusy('vanishing-host')).toBeNull();
  });

  it('tells the old tab it is out when the call moves to another tab', async () => {
    holdPeerRows(new Map());
    const tabA = connect('two-tabs', 'tab-a');
    await tabA.send(GCALL_C2S.START, { origin: 'community', originId: 'community-d' });
    const callId = joinedCallId(tabA);
    expect(callId).toBeDefined();

    const tabB = connect('two-tabs', 'tab-b');
    await tabB.send(GCALL_C2S.JOIN, { callId });

    expect(joinedCallId(tabB)).toBe(callId);
    expect(tabA.emitted).toContainEqual({
      event: GCALL_S2C.ENDED,
      payload: expect.objectContaining({ callId, reason: 'left' }),
    });

    await tabB.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  describe('a dropped media socket', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** A two-person ad-hoc room, both in. */
    async function twoPersonRoom(prefix: string) {
      holdPeerRows(new Map());
      const host = connect(`${prefix}-host`);
      const guest = connect(`${prefix}-guest`);
      await host.send(GCALL_C2S.START, { origin: 'adhoc', inviteeIds: [`${prefix}-guest`] });
      const callId = joinedCallId(host) as string;
      await guest.send(GCALL_C2S.JOIN, { callId });
      expect(joinedCallId(guest)).toBe(callId);
      return { host, guest, callId };
    }

    it('keeps the seat while the user reconnects', async () => {
      const { host, guest, callId } = await twoPersonRoom('blip');
      vi.useFakeTimers();

      (guest.socket as unknown as { disconnected: boolean }).disconnected = true;
      await handleGroupCallDisconnect(io, guest.socket);
      expect(__liveGroupCallCount()).toBe(1);

      const back = connect('blip-guest', 'blip-guest-reconnected');
      await back.send(GCALL_C2S.JOIN, { callId });
      expect(joinedCallId(back)).toBe(callId);

      await vi.advanceTimersByTimeAsync(GROUP_CALL_SEAT_GRACE_MS + 1_000);
      expect(__liveGroupCallCount()).toBe(1);
      expect(getBusy('blip-guest')).toEqual({ kind: 'gcall', id: callId });

      await host.send(GCALL_C2S.END, { callId });
      expect(__liveGroupCallCount()).toBe(0);
    });

    it('lets the seat go when nobody claims it', async () => {
      const { guest } = await twoPersonRoom('gone');
      vi.useFakeTimers();

      await handleGroupCallDisconnect(io, guest.socket);
      await vi.advanceTimersByTimeAsync(GROUP_CALL_SEAT_GRACE_MS + 1_000);

      // Two-person ad-hoc: one left, so the room closed itself.
      expect(__liveGroupCallCount()).toBe(0);
      expect(getBusy('gone-guest')).toBeNull();
      expect(getBusy('gone-host')).toBeNull();
    });
  });

  it('cancels the ring when the host leaves before anyone answers', async () => {
    holdPeerRows(new Map());
    const host = connect('cancel-host');
    await host.send(GCALL_C2S.START, {
      origin: 'adhoc',
      inviteeIds: ['cancel-one', 'cancel-two'],
    });
    const callId = joinedCallId(host);
    expect(getBusy('cancel-one')).toEqual({ kind: 'gcall', id: callId });

    await host.send(GCALL_C2S.LEAVE, { callId });

    expect(__liveGroupCallCount()).toBe(0);
    expect(getBusy('cancel-one')).toBeNull();
    expect(getBusy('cancel-two')).toBeNull();
  });

  it('removes someone from an open room when they stop being a member', async () => {
    holdPeerRows(new Map());
    const stays = connect('evict-stays');
    const goes = connect('evict-goes');
    await stays.send(GCALL_C2S.START, { origin: 'community', originId: 'community-e' });
    const callId = joinedCallId(stays) as string;
    await goes.send(GCALL_C2S.JOIN, { callId });
    expect(getBusy('evict-goes')).toEqual({ kind: 'gcall', id: callId });

    evictOriginMember(io, 'community', 'community-e', 'evict-goes');

    expect(getBusy('evict-goes')).toBeNull();
    expect(__liveGroupCallCount()).toBe(1);
    await stays.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });
});

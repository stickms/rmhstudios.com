import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { GCALL_C2S, GCALL_S2C } from '../../../../lib/groupcall/events';
import { claimBusy, getBusy, releaseBusy } from '../../busy-registry';
import { isPartyMember } from '../party';
import {
  GROUP_CALL_SEAT_GRACE_MS,
  __liveGroupCallCount,
  evictOriginMember,
  handleGroupCallDisconnect,
  sweepCommunityMembership,
  registerGroupCallHandlers,
} from '../group-call';

const mocks = vi.hoisted(() => ({
  prisma: {
    communityMember: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    userBlock: { findMany: vi.fn(), findFirst: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
    follow: { findMany: vi.fn() },
    groupCall: { create: vi.fn(), update: vi.fn() },
    conversation: { findFirst: vi.fn() },
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
  sockets: { sockets: new Map<string, Socket>(), adapter: { rooms: new Map<string, Set<string>>() } },
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

type IdFilter = string | { in: string[] };
const matches = (filter: IdFilter, id: string) =>
  typeof filter === 'string' ? filter === id : filter.in.includes(id);

/** Serve `userBlock` queries from a fixture, evaluating the OR-of-pairs shape the hub sends. */
function blocksBetween(rows: Array<{ blockerId: string; blockedId: string }>): void {
  const select = ({ where }: { where: { OR: Array<{ blockerId: IdFilter; blockedId: IdFilter }> } }) =>
    rows.filter((row) =>
      where.OR.some((c) => matches(c.blockerId, row.blockerId) && matches(c.blockedId, row.blockedId)),
    );
  mocks.prisma.userBlock.findMany.mockImplementation(async (args) => select(args));
  mocks.prisma.userBlock.findFirst.mockImplementation(async (args) => select(args)[0] ?? null);
}

const joinedCallId = (client: FakeClient): string | undefined =>
  client.emitted.find((e) => e.event === GCALL_S2C.JOINED)?.payload.callId as string | undefined;

describe('group-call admission races', () => {
  beforeEach(() => {
    mocks.prisma.communityMember.findUnique.mockReset().mockResolvedValue({ userId: 'member' });
    mocks.prisma.communityMember.findMany.mockReset().mockResolvedValue([]);
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.user.findMany
      .mockReset()
      .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id, name: id, image: null, handle: null }))),
      );
    mocks.prisma.userBlock.findMany.mockReset();
    mocks.prisma.userBlock.findFirst.mockReset();
    blocksBetween([]);
    mocks.prisma.notificationPreference.findMany
      .mockReset()
      .mockImplementation(({ where }: { where: { userId: { in: string[] } } }) =>
        Promise.resolve(where.userId.in.map((userId) => ({ userId, callPrivacy: 'everyone' }))),
      );
    mocks.prisma.follow.findMany.mockReset().mockResolvedValue([]);
    mocks.prisma.groupCall.create.mockReset().mockResolvedValue({});
    mocks.prisma.conversation.findFirst.mockReset().mockResolvedValue(null);
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
      // An open room's refusals never carry its id.
      payload: { reason: 'gone', operation: 'join', origin: 'community', originId: 'community-a' },
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

  it('does not ring two people into one mesh when one has blocked the other', async () => {
    holdPeerRows(new Map());
    blocksBetween([{ blockerId: 'pair-b', blockedId: 'pair-c' }]);
    const host = connect('pair-host');
    await host.send(GCALL_C2S.START, { origin: 'adhoc', inviteeIds: ['pair-b', 'pair-c'] });
    const callId = joinedCallId(host) as string;

    expect(getBusy('pair-b')).toEqual({ kind: 'gcall', id: callId });
    expect(getBusy('pair-c')).toBeNull();

    // Nor can a mid-call invite add them afterwards.
    await host.send(GCALL_C2S.INVITE, { callId, userIds: ['pair-c'] });
    expect(getBusy('pair-c')).toBeNull();
    expect(host.emitted).toContainEqual({
      event: GCALL_S2C.REJECTED,
      payload: expect.objectContaining({ reason: 'privacy', operation: 'invite' }),
    });

    await host.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('does not ring someone again after they declined', async () => {
    holdPeerRows(new Map());
    const host = connect('decline-host');
    const refuser = connect('decline-b');
    await host.send(GCALL_C2S.START, {
      origin: 'adhoc',
      inviteeIds: ['decline-b', 'decline-c'],
    });
    const callId = joinedCallId(host) as string;
    await refuser.send(GCALL_C2S.DECLINE, { callId });
    expect(getBusy('decline-b')).toBeNull();

    await host.send(GCALL_C2S.INVITE, { callId, userIds: ['decline-b'] });

    expect(getBusy('decline-b')).toBeNull();
    await host.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('asks an open room about membership again when a seat is re-claimed', async () => {
    holdPeerRows(new Map());
    const stays = connect('reclaim-stays');
    const away = connect('reclaim-away');
    await stays.send(GCALL_C2S.START, { origin: 'community', originId: 'community-f' });
    const callId = joinedCallId(stays) as string;
    await away.send(GCALL_C2S.JOIN, { callId });
    await handleGroupCallDisconnect(io, away.socket);

    // Removed from the community while their socket was down.
    mocks.prisma.communityMember.findUnique.mockResolvedValue(null);
    const back = connect('reclaim-away', 'reclaim-away-again');
    await back.send(GCALL_C2S.JOIN, { callId });

    expect(back.emitted).toContainEqual({
      event: GCALL_S2C.REJECTED,
      payload: expect.objectContaining({ reason: 'not-member', operation: 'join' }),
    });
    expect(joinedCallId(back)).toBeUndefined();

    evictOriginMember(io, 'community', 'community-f', 'reclaim-away');
    await stays.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('keeps someone out of an open room while a person they have a block with is in it', async () => {
    holdPeerRows(new Map());
    blocksBetween([{ blockerId: 'open-blocker', blockedId: 'open-blocked' }]);
    const blocker = connect('open-blocker');
    const blocked = connect('open-blocked');
    await blocker.send(GCALL_C2S.START, { origin: 'community', originId: 'community-g' });
    const callId = joinedCallId(blocker) as string;

    await blocked.send(GCALL_C2S.JOIN, { callId });

    expect(blocked.emitted).toContainEqual({
      event: GCALL_S2C.REJECTED,
      // Never `blocked`: the joiner is not told who in the room it came from.
      payload: expect.objectContaining({ reason: 'privacy', operation: 'join' }),
    });
    expect(getBusy('open-blocked')).toBeNull();
    await blocker.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('does not let the same person be rung again within the cooldown', async () => {
    holdPeerRows(new Map());
    const host = connect('cool-host');
    await host.send(GCALL_C2S.START, { origin: 'adhoc', inviteeIds: ['cool-target'] });
    const callId = joinedCallId(host) as string;
    await host.send(GCALL_C2S.END, { callId });
    expect(getBusy('cool-target')).toBeNull();

    // A fresh room straight away, ringing the same person.
    host.emitted.length = 0;
    await host.send(GCALL_C2S.START, { origin: 'adhoc', inviteeIds: ['cool-target'] });

    // `failed`, not `busy`: the caller is not on a call.
    expect(host.emitted).toContainEqual({
      event: GCALL_S2C.REJECTED,
      payload: expect.objectContaining({ reason: 'failed', operation: 'start' }),
    });
    expect(__liveGroupCallCount()).toBe(0);
    expect(getBusy('cool-target')).toBeNull();
  });

  it('counts leaving a ring as declining it', async () => {
    holdPeerRows(new Map());
    const host = connect('ringleave-host');
    const invitee = connect('ringleave-b');
    await host.send(GCALL_C2S.START, { origin: 'adhoc', inviteeIds: ['ringleave-b'] });
    const callId = joinedCallId(host) as string;

    await invitee.send(GCALL_C2S.LEAVE, { callId });

    // Everyone who was rung said no, so the host hears "declined".
    expect(__liveGroupCallCount()).toBe(0);
    // History is written on a fire-and-forget chain.
    await vi.waitFor(() =>
      expect(mocks.prisma.groupCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: callId },
          data: expect.objectContaining({ status: 'DECLINED' }),
        }),
      ),
    );
  });

  it('sweeps people who stopped being community members out of its voice room', async () => {
    holdPeerRows(new Map());
    const stays = connect('sweep-stays');
    const kicked = connect('sweep-kicked');
    await stays.send(GCALL_C2S.START, { origin: 'community', originId: 'community-h' });
    const callId = joinedCallId(stays) as string;
    await kicked.send(GCALL_C2S.JOIN, { callId });

    mocks.prisma.communityMember.findMany.mockResolvedValue([{ userId: 'sweep-stays' }]);
    await sweepCommunityMembership(io);

    expect(getBusy('sweep-kicked')).toBeNull();
    expect(getBusy('sweep-stays')).toEqual({ kind: 'gcall', id: callId });

    // An unreadable membership table evicts nobody.
    mocks.prisma.communityMember.findMany.mockRejectedValue(new Error('db down'));
    await sweepCommunityMembership(io);
    expect(getBusy('sweep-stays')).toEqual({ kind: 'gcall', id: callId });

    await stays.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('admits one at a time, so two people with a block cannot both slip in', async () => {
    holdPeerRows(new Map());
    blocksBetween([{ blockerId: 'race-x', blockedId: 'race-y' }]);
    const host = connect('race-room-host');
    await host.send(GCALL_C2S.START, { origin: 'community', originId: 'community-i' });
    const callId = joinedCallId(host) as string;

    const xRow = gate<unknown>();
    const yRow = gate<unknown>();
    holdPeerRows(
      new Map([
        ['race-x', xRow.promise],
        ['race-y', yRow.promise],
      ]),
    );
    const x = connect('race-x');
    const y = connect('race-y');
    const xJoin = x.send(GCALL_C2S.JOIN, { callId });
    const yJoin = y.send(GCALL_C2S.JOIN, { callId });
    await new Promise((resolve) => setTimeout(resolve, 0));

    xRow.open({ id: 'race-x', name: 'X', image: null, handle: null });
    yRow.open({ id: 'race-y', name: 'Y', image: null, handle: null });
    await Promise.all([xJoin, yJoin]);

    expect(joinedCallId(x)).toBe(callId);
    expect(joinedCallId(y)).toBeUndefined();
    expect(getBusy('race-y')).toBeNull();

    await x.send(GCALL_C2S.LEAVE, { callId });
    await host.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('records an open room as a call that happened, even with one person in it', async () => {
    holdPeerRows(new Map());
    const solo = connect('solo-host');
    await solo.send(GCALL_C2S.START, { origin: 'community', originId: 'community-j' });
    const callId = joinedCallId(solo) as string;
    await solo.send(GCALL_C2S.LEAVE, { callId });

    await vi.waitFor(() =>
      expect(mocks.prisma.groupCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: callId },
          data: expect.objectContaining({ status: 'ENDED' }),
        }),
      ),
    );
  });

  it('does not name a live open room to a non-member who happens to be busy', async () => {
    holdPeerRows(new Map());
    const member = connect('hidden-member');
    await member.send(GCALL_C2S.START, { origin: 'community', originId: 'community-k' });
    const callId = joinedCallId(member) as string;

    // Busy elsewhere, and not a member of community-k.
    expect(claimBusy('hidden-outsider', 'gcall', 'elsewhere')).toBe(true);
    mocks.prisma.communityMember.findUnique.mockResolvedValue(null);
    const outsider = connect('hidden-outsider');
    await outsider.send(GCALL_C2S.START, { origin: 'community', originId: 'community-k' });

    const refusal = outsider.emitted.find((e) => e.event === GCALL_S2C.REJECTED);
    expect(refusal?.payload).not.toHaveProperty('callId');
    releaseBusy('hidden-outsider', 'elsewhere');
    await member.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('keeps one history row per person that adds up their stints', async () => {
    holdPeerRows(new Map());
    const host = connect('stint-host');
    const guest = connect('stint-guest');
    await host.send(GCALL_C2S.START, { origin: 'community', originId: 'community-l' });
    const callId = joinedCallId(host) as string;
    vi.useFakeTimers();
    try {
      await guest.send(GCALL_C2S.JOIN, { callId });
      vi.advanceTimersByTime(10_000);
      await guest.send(GCALL_C2S.LEAVE, { callId });
      vi.advanceTimersByTime(5_000);
      await guest.send(GCALL_C2S.JOIN, { callId });
      vi.advanceTimersByTime(20_000);
      await guest.send(GCALL_C2S.LEAVE, { callId });
    } finally {
      vi.useRealTimers();
    }

    await vi.waitFor(() => {
      const rows = mocks.prisma.groupCallParticipant.upsert.mock.calls
        .map(([args]) => args)
        .filter((args) => args.where.callId_userId.userId === 'stint-guest');
      expect(rows.at(-1)?.update).toMatchObject({ status: 'LEFT', durationSec: 30 });
    });
    await host.send(GCALL_C2S.LEAVE, { callId });
  });

  it('lets someone be called straight back after a call they answered', async () => {
    holdPeerRows(new Map());
    const host = connect('callback-host');
    const friend = connect('callback-friend');
    await host.send(GCALL_C2S.START, { origin: 'adhoc', inviteeIds: ['callback-friend'] });
    const callId = joinedCallId(host) as string;
    await friend.send(GCALL_C2S.JOIN, { callId });
    await friend.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);

    host.emitted.length = 0;
    await host.send(GCALL_C2S.START, { origin: 'adhoc', inviteeIds: ['callback-friend'] });

    expect(getBusy('callback-friend')).not.toBeNull();
    const second = joinedCallId(host) as string;
    await host.send(GCALL_C2S.LEAVE, { callId: second });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('answers a non-member the same whether or not the space has a live room', async () => {
    holdPeerRows(new Map());
    const member = connect('same-member');
    await member.send(GCALL_C2S.START, { origin: 'community', originId: 'community-live' });
    const callId = joinedCallId(member) as string;

    mocks.prisma.communityMember.findUnique.mockResolvedValue(null);
    const outsider = connect('same-outsider');
    await outsider.send(GCALL_C2S.START, { origin: 'community', originId: 'community-live' });
    await outsider.send(GCALL_C2S.START, { origin: 'community', originId: 'community-quiet' });

    // Byte for byte the same apart from the id the caller sent us.
    const refusals = outsider.emitted
      .filter((e) => e.event === GCALL_S2C.REJECTED)
      .map((e) => JSON.stringify({ ...e.payload, originId: '<sent>' }));
    expect(refusals).toHaveLength(2);
    expect(refusals[0]).toBe(refusals[1]);
    expect(refusals[0]).not.toContain('callId');
    await member.send(GCALL_C2S.LEAVE, { callId });
  });

  it('checks blocks again when a ringing invitee answers', async () => {
    holdPeerRows(new Map());
    const host = connect('answer-host');
    const early = connect('answer-early');
    const late = connect('answer-late');
    await host.send(GCALL_C2S.START, {
      origin: 'adhoc',
      inviteeIds: ['answer-early', 'answer-late'],
    });
    const callId = joinedCallId(host) as string;
    await early.send(GCALL_C2S.JOIN, { callId });

    // A block appears while `answer-late` is still ringing.
    blocksBetween([{ blockerId: 'answer-early', blockedId: 'answer-late' }]);
    await late.send(GCALL_C2S.JOIN, { callId });

    expect(late.emitted).toContainEqual({
      event: GCALL_S2C.REJECTED,
      payload: expect.objectContaining({ reason: 'privacy', operation: 'join' }),
    });
    expect(joinedCallId(late)).toBeUndefined();
    await host.send(GCALL_C2S.END, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('starts a taken-over leg unmuted', async () => {
    holdPeerRows(new Map());
    const host = connect('mute-host');
    const tabA = connect('mute-user', 'mute-tab-a');
    await host.send(GCALL_C2S.START, { origin: 'community', originId: 'community-n' });
    const callId = joinedCallId(host) as string;
    await tabA.send(GCALL_C2S.JOIN, { callId });
    await tabA.send(GCALL_C2S.STATE, { callId, muted: true });

    const tabB = connect('mute-user', 'mute-tab-b');
    await tabB.send(GCALL_C2S.JOIN, { callId });

    const joined = tabB.emitted.find((e) => e.event === GCALL_S2C.JOINED);
    const me = (joined?.payload.participants as Array<{ userId: string; muted: boolean }>).find(
      (p) => p.userId === 'mute-user',
    );
    expect(me?.muted).toBe(false);
    await tabB.send(GCALL_C2S.LEAVE, { callId });
    await host.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });

  it('ends a ring the hub refused to let them answer', async () => {
    holdPeerRows(new Map());
    const host = connect('refused-host');
    const early = connect('refused-early');
    const late = connect('refused-late');
    await host.send(GCALL_C2S.START, {
      origin: 'adhoc',
      inviteeIds: ['refused-early', 'refused-late'],
    });
    const callId = joinedCallId(host) as string;
    await early.send(GCALL_C2S.JOIN, { callId });
    blocksBetween([{ blockerId: 'refused-early', blockedId: 'refused-late' }]);

    await late.send(GCALL_C2S.JOIN, { callId });

    // Not left ringing (and busy) for the rest of the ring.
    expect(getBusy('refused-late')).toBeNull();
    await host.send(GCALL_C2S.END, { callId });
  });

  it('tells a one-invitee host `privacy`, never `blocked`', async () => {
    holdPeerRows(new Map());
    blocksBetween([{ blockerId: 'solo-callee', blockedId: 'solo-caller' }]);
    const caller = connect('solo-caller');
    await caller.send(GCALL_C2S.START, { origin: 'adhoc', inviteeIds: ['solo-callee'] });

    expect(caller.emitted).toContainEqual({
      event: GCALL_S2C.REJECTED,
      payload: expect.objectContaining({ reason: 'privacy', operation: 'start' }),
    });
  });

  it('drops a DM thread the host is not part of', async () => {
    holdPeerRows(new Map());
    const host = connect('thread-host');
    await host.send(GCALL_C2S.START, {
      origin: 'adhoc',
      inviteeIds: ['thread-guest'],
      conversationId: 'someone-elses-dm',
    });
    const joined = host.emitted.find((e) => e.event === GCALL_S2C.JOINED);
    expect(joined?.payload.conversationId).toBeNull();
    await host.send(GCALL_C2S.END, { callId: joined?.payload.callId });
  });

  it('answers an open-room invite the same whether or not anyone was pinged', async () => {
    holdPeerRows(new Map());
    const host = connect('quiet-host');
    await host.send(GCALL_C2S.START, { origin: 'community', originId: 'community-o' });
    const callId = joinedCallId(host) as string;
    const before = host.emitted.length;

    mocks.prisma.communityMember.findUnique.mockResolvedValue(null);
    await host.send(GCALL_C2S.INVITE, { callId, userIds: ['quiet-outsider'] });

    expect(host.emitted.slice(before)).toEqual([]);
    await host.send(GCALL_C2S.LEAVE, { callId });
  });

  it('reports a mid-call invite refused by a block as `privacy`', async () => {
    holdPeerRows(new Map());
    const host = connect('midblock-host');
    const guest = connect('midblock-guest');
    await host.send(GCALL_C2S.START, { origin: 'adhoc', inviteeIds: ['midblock-guest'] });
    const callId = joinedCallId(host) as string;
    await guest.send(GCALL_C2S.JOIN, { callId });
    blocksBetween([{ blockerId: 'midblock-target', blockedId: 'midblock-host' }]);

    await host.send(GCALL_C2S.INVITE, { callId, userIds: ['midblock-target'] });

    const refusal = host.emitted.find(
      (e) => e.event === GCALL_S2C.REJECTED && e.payload.operation === 'invite',
    );
    expect(refusal?.payload.reason).toBe('privacy');
    await host.send(GCALL_C2S.END, { callId });
  });

  it('stays silent when an open-room ping is repeated inside the cooldown', async () => {
    holdPeerRows(new Map());
    const host = connect('repeat-host');
    await host.send(GCALL_C2S.START, { origin: 'community', originId: 'community-p' });
    const callId = joinedCallId(host) as string;
    const before = host.emitted.length;

    await host.send(GCALL_C2S.INVITE, { callId, userIds: ['repeat-target'] });
    await host.send(GCALL_C2S.INVITE, { callId, userIds: ['repeat-target'] });

    expect(host.emitted.slice(before)).toEqual([]);
    await host.send(GCALL_C2S.LEAVE, { callId });
  });

  it('does not let a dropped ring back in on the JOIN that raced it', async () => {
    holdPeerRows(new Map());
    const host = connect('dropped-host');
    const tabA = connect('dropped-guest', 'dropped-tab-a');
    const tabB = connect('dropped-guest', 'dropped-tab-b');
    await host.send(GCALL_C2S.START, {
      origin: 'adhoc',
      inviteeIds: ['dropped-guest', 'dropped-other'],
    });
    const callId = joinedCallId(host) as string;

    // Tab A answers; its block check is slow. Tab B declines meanwhile.
    const check = gate<null>();
    mocks.prisma.userBlock.findFirst.mockImplementationOnce(() => check.promise);
    const answering = tabA.send(GCALL_C2S.JOIN, { callId });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tabB.send(GCALL_C2S.DECLINE, { callId });
    check.open(null);
    await answering;

    expect(joinedCallId(tabA)).toBeUndefined();
    expect(getBusy('dropped-guest')).toBeNull();
    await host.send(GCALL_C2S.END, { callId });
  });

  it('asks party membership once more right before seating', async () => {
    holdPeerRows(new Map());
    const member = vi.mocked(isPartyMember);
    member.mockReturnValue(true);
    const host = connect('party-host');
    await host.send(GCALL_C2S.START, { origin: 'party', originId: 'party-q' });
    const callId = joinedCallId(host) as string;

    const row = gate<unknown>();
    holdPeerRows(new Map([['party-leaver', row.promise]]));
    const leaver = connect('party-leaver');
    const joining = leaver.send(GCALL_C2S.JOIN, { callId });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // They leave the party while their peer row loads.
    member.mockImplementation((_party, userId) => userId !== 'party-leaver');
    row.open({ id: 'party-leaver', name: 'Leaver', image: null, handle: null });
    await joining;

    expect(joinedCallId(leaver)).toBeUndefined();
    expect(getBusy('party-leaver')).toBeNull();
    member.mockReset();
    member.mockReturnValue(true);
    await host.send(GCALL_C2S.LEAVE, { callId });
    expect(__liveGroupCallCount()).toBe(0);
  });
});

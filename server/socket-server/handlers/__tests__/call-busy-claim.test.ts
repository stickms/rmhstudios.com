import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { CALL_C2S, CALL_S2C, RING_TIMEOUT_MS } from '../../../../lib/call/events';
import { claimBusy, getBusy, releaseBusy } from '../../busy-registry';
import { __liveCallCount, registerCallHandlers } from '../call';

const mocks = vi.hoisted(() => {
  return {
    requestAutoReply: vi.fn(),
    prisma: {
      userBlock: { findFirst: vi.fn() },
      notificationPreference: { findUnique: vi.fn() },
      follow: { findFirst: vi.fn() },
      callMute: { findFirst: vi.fn() },
      call: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      user: { findUnique: vi.fn() },
    },
  };
});

vi.mock('../../prisma-client', () => ({
  getPrismaClient: () => mocks.prisma,
}));

vi.mock('../../call-auto-reply', () => ({
  requestCallAutoReply: mocks.requestAutoReply,
}));

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn() },
}));

vi.mock('../../rate-limit', () => ({
  checkRateLimit: () => true,
}));

describe('1:1 call busy claims', () => {
  beforeEach(() => {
    releaseBusy('caller', 'group-call');
    releaseBusy('callee', 'group-call');
    mocks.prisma.userBlock.findFirst.mockReset();
    mocks.prisma.notificationPreference.findUnique.mockReset();
    mocks.prisma.follow.findFirst.mockReset();
    mocks.prisma.callMute.findFirst.mockReset().mockResolvedValue(null);
    mocks.requestAutoReply.mockReset();
    mocks.prisma.call.create.mockReset();
    mocks.prisma.call.update.mockReset();
    mocks.prisma.user.findUnique.mockReset();
  });

  it('cancels and rejects when the callee is claimed by a group call during permission lookup', async () => {
    let resolvePermission!: (value: null) => void;
    mocks.prisma.userBlock.findFirst.mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          resolvePermission = resolve;
        }),
    );
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue({ callPrivacy: 'everyone' });
    mocks.prisma.follow.findFirst.mockResolvedValue(null);
    mocks.prisma.call.create.mockResolvedValue({ id: 'one-to-one-call' });
    mocks.prisma.call.update.mockResolvedValue({});

    const handlers = new Map<string, (payload: unknown) => Promise<void> | void>();
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const socket = {
      id: 'caller-socket',
      data: { userId: 'caller' },
      on: (event: string, handler: (payload: unknown) => Promise<void> | void) =>
        handlers.set(event, handler),
      emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
      join: () => {},
    } as unknown as Socket;
    const io = {
      in: () => ({ fetchSockets: async () => [{ id: 'callee-socket' }] }),
      to: () => ({ emit: vi.fn() }),
    } as unknown as Server;

    registerCallHandlers(io, socket);
    const invite = handlers.get(CALL_C2S.INVITE);
    expect(invite).toBeDefined();
    const pending = invite?.({ calleeId: 'callee' });

    expect(claimBusy('callee', 'gcall', 'group-call')).toBe(true);
    resolvePermission(null);
    await pending;

    expect(emitted).toContainEqual({
      event: CALL_S2C.REJECTED,
      payload: { reason: 'busy' },
    });
    expect(mocks.prisma.call.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED', endedAt: expect.any(Date) }),
      }),
    );
    expect(__liveCallCount()).toBe(0);
    expect(getBusy('caller')).toBeNull();
    expect(getBusy('callee')).toEqual({ kind: 'gcall', id: 'group-call' });
  });

  it('does not ring the callee when the caller disconnected during the invite awaits', async () => {
    let resolvePermission!: (value: null) => void;
    mocks.prisma.userBlock.findFirst.mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          resolvePermission = resolve;
        }),
    );
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue({ callPrivacy: 'everyone' });
    mocks.prisma.follow.findFirst.mockResolvedValue(null);
    mocks.prisma.call.create.mockResolvedValue({ id: 'dead-call' });
    mocks.prisma.call.update.mockResolvedValue({});

    const handlers = new Map<string, (payload: unknown) => Promise<void> | void>();
    const roomEmits: string[] = [];
    const socket = {
      id: 'caller-socket-2',
      data: { userId: 'caller' },
      disconnected: false,
      on: (event: string, handler: (payload: unknown) => Promise<void> | void) =>
        handlers.set(event, handler),
      emit: vi.fn(),
      join: () => {},
    } as unknown as Socket & { disconnected: boolean };
    const io = {
      in: () => ({ fetchSockets: async () => [{ id: 'callee-socket' }] }),
      to: () => ({ emit: (event: string) => roomEmits.push(event) }),
    } as unknown as Server;

    registerCallHandlers(io, socket);
    const pending = handlers.get(CALL_C2S.INVITE)?.({ calleeId: 'callee' });
    (socket as unknown as { disconnected: boolean }).disconnected = true;
    resolvePermission(null);
    await pending;

    expect(roomEmits).not.toContain(CALL_S2C.INCOMING);
    expect(__liveCallCount()).toBe(0);
    expect(getBusy('caller')).toBeNull();
    expect(getBusy('callee')).toBeNull();
    expect(mocks.prisma.call.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });

  it('refuses a caller the callee has muted, as a privacy refusal, before anything rings', async () => {
    mocks.prisma.userBlock.findFirst.mockResolvedValue(null);
    // `everyone` and a mutual follow: only the mute can be what stops this call.
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue({ callPrivacy: 'everyone' });
    mocks.prisma.follow.findFirst.mockResolvedValue({ followerId: 'x' });
    mocks.prisma.callMute.findFirst.mockResolvedValue({ id: 'mute-1' });

    const handlers = new Map<string, (payload: unknown) => Promise<void> | void>();
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const socket = {
      id: 'caller-socket-3',
      data: { userId: 'caller' },
      on: (event: string, handler: (payload: unknown) => Promise<void> | void) =>
        handlers.set(event, handler),
      emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
      join: () => {},
    } as unknown as Socket;
    const io = {
      in: () => ({ fetchSockets: async () => [{ id: 'callee-socket' }] }),
      to: () => ({ emit: vi.fn() }),
    } as unknown as Server;

    registerCallHandlers(io, socket);
    await handlers.get(CALL_C2S.INVITE)?.({ calleeId: 'callee' });

    // The caller learns only "privacy" — indistinguishable from the setting.
    expect(emitted).toEqual([{ event: CALL_S2C.REJECTED, payload: { reason: 'privacy' } }]);
    expect(mocks.prisma.call.create).not.toHaveBeenCalled();
    // The lookup is scoped to THIS callee muting THIS caller, and to unexpired rows.
    expect(mocks.prisma.callMute.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'callee',
          mutedUserId: 'caller',
          until: { gt: expect.any(Date) },
        }),
      }),
    );
  });
});

describe('automatic replies from the hub', () => {
  // Own resets: a mock left resolved by an earlier describe (the mute test leaves
  // `callMute` returning a row) would make every caller here look muted.
  beforeEach(() => {
    for (const group of Object.values(mocks.prisma)) {
      for (const fn of Object.values(group)) (fn as ReturnType<typeof vi.fn>).mockReset();
    }
    mocks.prisma.callMute.findFirst.mockResolvedValue(null);
    mocks.requestAutoReply.mockReset();
    releaseBusy('caller', 'group-call');
    releaseBusy('callee', 'group-call');
  });

  function harness(opts: { callerId?: string; sockets?: unknown[] } = {}) {
    const handlers = new Map<string, (payload: unknown) => Promise<void> | void>();
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const socket = {
      id: `socket-${Math.random()}`,
      data: { userId: opts.callerId ?? 'caller' },
      on: (event: string, handler: (payload: unknown) => Promise<void> | void) =>
        handlers.set(event, handler),
      emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
      join: () => {},
    } as unknown as Socket;
    const io = {
      in: () => ({ fetchSockets: async () => opts.sockets ?? [{ id: 'callee-socket' }] }),
      to: () => ({ emit: vi.fn() }),
    } as unknown as Server;
    registerCallHandlers(io, socket);
    return { invite: handlers.get(CALL_C2S.INVITE)!, emitted };
  }

  function permit(prefs: Record<string, unknown> = {}) {
    mocks.prisma.userBlock.findFirst.mockResolvedValue(null);
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue({
      callPrivacy: 'everyone',
      ...prefs,
    });
    mocks.prisma.follow.findFirst.mockResolvedValue(null);
  }

  it('asks for a "busy" reply when the callee is on another call', async () => {
    releaseBusy('callee', 'group-call');
    expect(claimBusy('callee', 'gcall', 'group-call')).toBe(true);
    const { invite, emitted } = harness();
    await invite({ calleeId: 'callee' });
    expect(emitted).toContainEqual({ event: CALL_S2C.REJECTED, payload: { reason: 'busy' } });
    expect(mocks.requestAutoReply).toHaveBeenCalledWith({
      callerId: 'caller',
      calleeId: 'callee',
      trigger: 'busy',
    });
    releaseBusy('callee', 'group-call');
  });

  it('asks for nothing when it is the CALLER who is busy', async () => {
    expect(claimBusy('caller', 'gcall', 'group-call')).toBe(true);
    const { invite, emitted } = harness();
    await invite({ calleeId: 'callee' });
    expect(emitted).toContainEqual({ event: CALL_S2C.REJECTED, payload: { reason: 'busy' } });
    expect(mocks.requestAutoReply).not.toHaveBeenCalled();
    releaseBusy('caller', 'group-call');
  });

  it('does not ring a reply_only callee, tells the caller they are unavailable, and asks for a reply', async () => {
    permit({ callAnswerMode: 'reply_only' });
    const { invite, emitted } = harness();
    await invite({ calleeId: 'callee' });
    expect(emitted).toEqual([{ event: CALL_S2C.REJECTED, payload: { reason: 'offline' } }]);
    expect(mocks.prisma.call.create).not.toHaveBeenCalled();
    expect(mocks.requestAutoReply).toHaveBeenCalledWith({
      callerId: 'caller',
      calleeId: 'callee',
      trigger: 'unavailable',
    });
  });

  it('never asks for a reply on behalf of someone who may not call at all', async () => {
    // reply_only AND a block: the refusal is the block's, and nothing is sent.
    permit({ callAnswerMode: 'reply_only' });
    mocks.prisma.userBlock.findFirst.mockResolvedValue({ blockerId: 'callee' });
    const { invite, emitted } = harness();
    await invite({ calleeId: 'callee' });
    expect(emitted).toEqual([{ event: CALL_S2C.REJECTED, payload: { reason: 'blocked' } }]);
    expect(mocks.requestAutoReply).not.toHaveBeenCalled();
  });

  it('asks for nothing in the default ring mode', async () => {
    permit();
    const { invite, emitted } = harness({ sockets: [] });
    await invite({ calleeId: 'callee' });
    expect(emitted).toEqual([{ event: CALL_S2C.REJECTED, payload: { reason: 'offline' } }]);
    expect(mocks.requestAutoReply).not.toHaveBeenCalled();
  });

  it('asks for a "missed" reply when a call rings out', async () => {
    vi.useFakeTimers();
    try {
      permit({ callAnswerMode: 'ring_reply' });
      mocks.prisma.call.create.mockResolvedValue({ id: 'ringing-call' });
      mocks.prisma.call.update.mockResolvedValue({});
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'caller',
        name: 'Caller',
        image: null,
        handle: null,
      });
      const { invite } = harness();
      await invite({ calleeId: 'callee' });
      expect(mocks.requestAutoReply).not.toHaveBeenCalled();

      vi.advanceTimersByTime(RING_TIMEOUT_MS + 1);
      expect(mocks.requestAutoReply).toHaveBeenCalledWith({
        callerId: 'caller',
        calleeId: 'callee',
        trigger: 'missed',
      });
      expect(__liveCallCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

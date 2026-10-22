import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { CALL_C2S, CALL_S2C } from '../../../../lib/call/events';
import { claimBusy, getBusy, releaseBusy } from '../../busy-registry';
import { __liveCallCount, registerCallHandlers } from '../call';

const mocks = vi.hoisted(() => {
  return {
    prisma: {
      userBlock: { findFirst: vi.fn() },
      notificationPreference: { findUnique: vi.fn() },
      follow: { findFirst: vi.fn() },
      call: { create: vi.fn(), update: vi.fn() },
      user: { findUnique: vi.fn() },
    },
  };
});

vi.mock('../../prisma-client', () => ({
  getPrismaClient: () => mocks.prisma,
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
});

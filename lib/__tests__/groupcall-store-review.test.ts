import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GCALL_S2C } from '@/lib/groupcall/events';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  const emits: Array<{ event: string; payload: unknown }> = [];
  const meshes: Array<{
    closed: boolean;
    openMicrophone: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    setMuted: ReturnType<typeof vi.fn>;
    setSelfId: ReturnType<typeof vi.fn>;
    syncPeers: ReturnType<typeof vi.fn>;
  }> = [];

  return {
    handlers,
    emits,
    meshes,
    getSession: vi.fn(async () => ({ data: { user: { id: 'self' } } })),
    openMicrophone: vi.fn(async () => {}),
    client: {
      socket: {
        on: vi.fn((event: string, handler: (payload: unknown) => void) => {
          handlers.set(event, handler);
        }),
      },
      emit: vi.fn((event: string, payload: unknown) => {
        emits.push({ event, payload });
        return true;
      }),
    },
  };
});

vi.mock('@/lib/auth-client', () => ({
  authClient: { getSession: mocks.getSession },
}));

vi.mock('@/lib/shared/realtime/client', () => ({
  createRealtimeClient: () => mocks.client,
}));

vi.mock('@/lib/groupcall/support', () => ({
  groupCallSupported: () => true,
  describeMicrophoneError: () => 'unknown',
}));

vi.mock('@/lib/groupcall/mesh', () => ({
  GroupCallMesh: class {
    closed = false;
    openMicrophone = vi.fn(() => mocks.openMicrophone());
    close = vi.fn(() => {
      this.closed = true;
    });
    setMuted = vi.fn();
    setSelfId = vi.fn();
    syncPeers = vi.fn();

    constructor() {
      mocks.meshes.push(this);
    }
  },
}));

describe('group-call review regressions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', {});
    mocks.handlers.clear();
    mocks.emits.length = 0;
    mocks.meshes.length = 0;
    mocks.getSession.mockClear();
    mocks.openMicrophone.mockReset().mockResolvedValue(undefined);
    mocks.client.socket.on.mockClear();
    mocks.client.emit.mockClear();
  });

  it('does not let a cancelled media setup close or start over a newer attempt', async () => {
    const requests: Array<(response: { ok: boolean; json: () => Promise<unknown> }) => void> = [];
    const fetch = vi.fn(
      () =>
        new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
          requests.push(resolve);
        }),
    );
    vi.stubGlobal('fetch', fetch);

    const groupCall = await import('@/lib/groupcall/store');
    const first = groupCall.startGroupCall({ origin: 'community', originId: 'first' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    groupCall.leaveGroupCall();
    const second = groupCall.startGroupCall({ origin: 'community', originId: 'second' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    requests[1]({ ok: true, json: async () => ({ iceServers: [] }) });
    await second;
    expect(mocks.meshes).toHaveLength(1);
    const secondMesh = mocks.meshes[0];

    requests[0]({ ok: true, json: async () => ({ iceServers: [] }) });
    await first;

    expect(secondMesh.closed).toBe(false);
    expect(mocks.emits.filter(({ event }) => event === 'gcall:start')).toHaveLength(1);
    expect(mocks.emits.at(-1)?.payload).toMatchObject({ originId: 'second' });
  });

  it('disposes only its own mesh when microphone setup finishes after a newer call', async () => {
    let finishFirstMicrophone!: () => void;
    mocks.openMicrophone.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirstMicrophone = resolve;
        }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ iceServers: [] }) })),
    );

    const groupCall = await import('@/lib/groupcall/store');
    const first = groupCall.startGroupCall({ origin: 'community', originId: 'first' });
    await vi.waitFor(() => expect(mocks.meshes[0]?.openMicrophone).toHaveBeenCalledOnce());

    groupCall.leaveGroupCall();
    const second = groupCall.startGroupCall({ origin: 'community', originId: 'second' });
    await second;
    const secondMesh = mocks.meshes[1];
    expect(secondMesh.closed).toBe(false);

    finishFirstMicrophone();
    await first;

    expect(secondMesh.closed).toBe(false);
    expect(mocks.emits.filter(({ event }) => event === 'gcall:start')).toHaveLength(1);
    expect(mocks.emits.at(-1)?.payload).toMatchObject({ originId: 'second' });
  });

  it('keeps a local mute private until JOINED confirms admission', async () => {
    let resolveIce!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    const fetch = vi.fn(
      () =>
        new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
          resolveIce = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);

    const groupCall = await import('@/lib/groupcall/store');
    const joining = groupCall.joinGroupCall('room-id');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    groupCall.toggleGroupMute();
    expect(mocks.emits.some(({ event }) => event === 'gcall:state')).toBe(false);

    resolveIce({ ok: true, json: async () => ({ iceServers: [] }) });
    await joining;
    mocks.handlers.get(GCALL_S2C.JOINED)?.({
      callId: 'room-id',
      origin: 'community',
      originId: 'community-id',
      conversationId: null,
      selfId: 'self',
      hostId: 'self',
      participants: [
        {
          userId: 'self',
          name: 'Self',
          image: null,
          handle: null,
          muted: true,
          host: true,
          joinedAt: Date.now(),
        },
      ],
      startedAt: Date.now(),
    });

    expect(mocks.emits).toContainEqual({
      event: 'gcall:state',
      payload: { callId: 'room-id', muted: true },
    });
  });

  it('expires an unanswered incoming room locally', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const groupCall = await import('@/lib/groupcall/store');
    groupCall.initGroupCalls();
    mocks.handlers.get(GCALL_S2C.INCOMING)?.({
      callId: 'expiring-room',
      origin: 'adhoc',
      originId: null,
      conversationId: null,
      from: { id: 'caller', name: 'Caller', image: null, handle: null },
      participants: [],
      expiresAt: Date.now() + 20,
    });

    await vi.waitFor(() => expect(groupCall.useGroupCallStore.getState().phase).toBe('ended'));
    expect(groupCall.useGroupCallStore.getState().endReason).toBe('unanswered');
  });

  it('reports a rejected mid-call invite without closing the existing room', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ iceServers: [] }) })),
    );
    const groupCall = await import('@/lib/groupcall/store');
    const joining = groupCall.joinGroupCall('room-id');
    await joining;
    mocks.handlers.get(GCALL_S2C.JOINED)?.({
      callId: 'room-id',
      origin: 'community',
      originId: 'community-id',
      conversationId: null,
      selfId: 'self',
      hostId: 'self',
      participants: [],
      startedAt: Date.now(),
    });
    const activeMesh = mocks.meshes[0];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mocks.handlers.get(GCALL_S2C.REJECTED)?.({
      reason: 'full',
      operation: 'invite',
      callId: 'room-id',
    });

    expect(groupCall.useGroupCallStore.getState().phase).toBe('active');
    expect(groupCall.useGroupCallStore.getState().lastInviteRejection).toMatchObject({
      operation: 'invite',
      reason: 'full',
      callId: 'room-id',
    });
    expect(activeMesh.closed).toBe(false);
    warn.mockRestore();
  });
});

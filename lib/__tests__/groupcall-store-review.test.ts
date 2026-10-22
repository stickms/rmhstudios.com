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
    setIceServers: ReturnType<typeof vi.fn>;
  }> = [];

  return {
    handlers,
    emits,
    meshes,
    options: null as null | { onConnect?: (socket: unknown, info: { isReconnect: boolean }) => void },
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
  createRealtimeClient: (options: typeof mocks.options) => {
    mocks.options = options;
    return mocks.client;
  },
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
    setIceServers = vi.fn();

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

  it('rebuilds every peer leg when it re-joins after a reconnect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ iceServers: [] }) })),
    );
    const groupCall = await import('@/lib/groupcall/store');
    await groupCall.joinGroupCall('room-id');
    mocks.handlers.get(GCALL_S2C.JOINED)?.({
      callId: 'room-id',
      origin: 'community',
      originId: 'community-id',
      conversationId: null,
      selfId: 'self',
      hostId: 'peer',
      participants: [],
      startedAt: Date.now(),
    });
    expect(groupCall.useGroupCallStore.getState().phase).toBe('active');
    const mesh = mocks.meshes[0];
    mesh.syncPeers.mockClear();
    mocks.emits.length = 0;

    mocks.options?.onConnect?.({}, { isReconnect: true });

    // Every old leg goes before the JOIN, so JOINED negotiates them afresh.
    expect(mesh.syncPeers).toHaveBeenCalledWith([]);
    expect(mocks.emits).toContainEqual({ event: 'gcall:join', payload: { callId: 'room-id' } });
  });

  it('does not re-send a JOIN that is still waiting on the microphone', async () => {
    let grantMicrophone!: () => void;
    mocks.openMicrophone.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          grantMicrophone = resolve;
        }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ iceServers: [] }) })),
    );
    const groupCall = await import('@/lib/groupcall/store');
    const joining = groupCall.joinGroupCall('room-id');
    await vi.waitFor(() => expect(mocks.meshes).toHaveLength(1));

    mocks.options?.onConnect?.({}, { isReconnect: true });
    expect(mocks.emits.filter(({ event }) => event === 'gcall:join')).toHaveLength(0);

    grantMicrophone();
    await joining;
    expect(mocks.emits.filter(({ event }) => event === 'gcall:join')).toHaveLength(1);
  });

  it('sends no LEAVE when cancelled before its JOIN went out', async () => {
    mocks.openMicrophone.mockImplementationOnce(() => new Promise<void>(() => {}));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ iceServers: [] }) })),
    );
    const groupCall = await import('@/lib/groupcall/store');
    void groupCall.joinGroupCall('room-id');
    await vi.waitFor(() => expect(mocks.meshes).toHaveLength(1));

    groupCall.leaveGroupCall();

    expect(groupCall.useGroupCallStore.getState().phase).toBe('ended');
    expect(mocks.emits.some(({ event }) => event === 'gcall:leave')).toBe(false);
  });

  it('does not fail a START still waiting on the microphone when the socket reconnects', async () => {
    let grantMicrophone!: () => void;
    mocks.openMicrophone.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          grantMicrophone = resolve;
        }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ iceServers: [] }) })),
    );
    const groupCall = await import('@/lib/groupcall/store');
    const starting = groupCall.startGroupCall({ origin: 'community', originId: 'c' });
    await vi.waitFor(() => expect(mocks.meshes).toHaveLength(1));

    mocks.options?.onConnect?.({}, { isReconnect: true });
    expect(groupCall.useGroupCallStore.getState().phase).toBe('joining');

    grantMicrophone();
    await starting;
    expect(mocks.emits.filter(({ event }) => event === 'gcall:start')).toHaveLength(1);
  });

  it('ignores the echo of its own LEAVE while walking back into the same room', async () => {
    const answers: Array<() => void> = [];
    mocks.openMicrophone.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          answers.push(resolve);
        }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ iceServers: [] }) })),
    );
    const groupCall = await import('@/lib/groupcall/store');
    const first = groupCall.joinGroupCall('room-id');
    await vi.waitFor(() => expect(answers).toHaveLength(1));
    answers[0]();
    await first;
    mocks.handlers.get(GCALL_S2C.JOINED)?.({
      callId: 'room-id',
      origin: 'community',
      originId: 'community-id',
      conversationId: null,
      selfId: 'self',
      hostId: 'peer',
      participants: [],
      startedAt: Date.now(),
    });
    groupCall.leaveGroupCall();

    // Straight back in; the server's ENDED for the visit we left lands while
    // the mic prompt for this one is still open.
    const second = groupCall.joinGroupCall('room-id');
    await vi.waitFor(() => expect(answers).toHaveLength(2));
    mocks.handlers.get(GCALL_S2C.ENDED)?.({ callId: 'room-id', reason: 'left', durationSec: 1 });
    expect(groupCall.useGroupCallStore.getState().phase).toBe('joining');

    answers[1]();
    await second;
    expect(mocks.emits.filter(({ event }) => event === 'gcall:join')).toHaveLength(2);
    mocks.openMicrophone.mockReset().mockResolvedValue(undefined);
  });

  it('re-mints ICE servers for a long call', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      let mint = 0;
      const fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ iceServers: [{ urls: [`turn:relay?${++mint}`] }] }),
      }));
      vi.stubGlobal('fetch', fetch);
      const groupCall = await import('@/lib/groupcall/store');
      await groupCall.joinGroupCall('room-id');
      const mesh = mocks.meshes[0];

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.waitFor(() =>
        expect(mesh.setIceServers).toHaveBeenCalledWith([{ urls: ['turn:relay?2'] }]),
      );
      groupCall.leaveGroupCall();
    } finally {
      vi.useRealTimers();
    }
  });
});

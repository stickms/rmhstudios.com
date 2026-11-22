import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VIBE_ROOM_C2S, VIBE_ROOM_S2C, type VibeRoomState } from '../../../lib/rmhvibe/room-events';
import { all, last, makeWorld } from '../test-support/fake-world';
import {
  handleVibeRoomDisconnect,
  registerVibeRoomHandlers,
  resetVibeRoomsForTests,
  setInstanceVerifierForTests,
} from './vibe-room';
import { createInstanceVerifier } from '../discord-instance';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));
vi.mock('../prisma-client', () => ({
  getPrismaClient: () => ({
    vibePage: {
      findUnique: mocks.findUnique,
    },
  }),
}));

const guest = (name: string) => ({
  discordGuest: {
    name,
    avatarUrl: null,
  },
});
const errors = (s: Parameters<typeof all>[0]) =>
  all<{
    code: string;
  }>(s, VIBE_ROOM_S2C.ERROR).map((e) => e.code);

describe('vibe room', () => {
  let world: ReturnType<typeof makeWorld>;
  beforeEach(() => {
    resetVibeRoomsForTests();
    mocks.findUnique.mockReset();
    world = makeWorld(registerVibeRoomHandlers);
  });

  it('refuses an unauthenticated join', () => {
    const a = world.connect('a');
    world.send(a, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'i1',
    });
    expect(errors(a)).toEqual(['AUTH']);
    expect(last(a, VIBE_ROOM_S2C.STATE)).toBeUndefined();
  });

  it('refuses the 26th member', () => {
    for (let i = 0; i < 25; i += 1) {
      world.send(world.connect(`s${i}`, guest(`g${i}`)), VIBE_ROOM_C2S.JOIN, {
        instanceId: 'i1',
      });
    }
    const late = world.connect('late', guest('late'));
    world.send(late, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'i1',
    });
    expect(errors(late)).toEqual(['FULL']);
  });

  it('ignores SELECT from a non-host', () => {
    const a = world.connect('a', guest('a'));
    const b = world.connect('b', guest('b'));
    world.send(a, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'i1',
    });
    world.send(b, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'i1',
    });
    world.send(b, VIBE_ROOM_C2S.SELECT, {
      slug: 'neon',
    });
    expect(errors(b)).toEqual(['NOT_HOST']);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(last<VibeRoomState>(a, VIBE_ROOM_S2C.STATE)?.slug).toBeNull();
  });

  it('promotes the next member when the host disconnects', async () => {
    vi.useFakeTimers();
    try {
      const a = world.connect('a', guest('a'));
      vi.advanceTimersByTime(5);
      const b = world.connect('b', guest('b'));
      world.send(a, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'i1',
      });
      vi.advanceTimersByTime(5);
      world.send(b, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'i1',
      });
      expect(last<VibeRoomState>(b, VIBE_ROOM_S2C.STATE)?.hostSid).toBe('a');
      handleVibeRoomDisconnect(world.io, a as never);
      expect(last<VibeRoomState>(b, VIBE_ROOM_S2C.STATE)?.hostSid).toBe('b');
    } finally {
      vi.useRealTimers();
    }
  });

  it('only lets the host pick a ready vibe', async () => {
    const a = world.connect('a', guest('a'));
    world.send(a, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'i1',
    });
    mocks.findUnique.mockResolvedValueOnce({
      status: 'generating',
    });
    world.send(a, VIBE_ROOM_C2S.SELECT, {
      slug: 'x',
    });
    await vi.waitFor(() => expect(errors(a)).toEqual(['BAD_SLUG']));
    mocks.findUnique.mockResolvedValueOnce({
      status: 'ready',
    });
    world.send(a, VIBE_ROOM_C2S.SELECT, {
      slug: 'x',
    });
    await vi.waitFor(() => expect(last<VibeRoomState>(a, VIBE_ROOM_S2C.STATE)?.slug).toBe('x'));
  });

  it('relays small messages to others and refuses oversized or cyclic ones', () => {
    const a = world.connect('a', guest('a'));
    const b = world.connect('b', guest('b'));
    world.send(a, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'i1',
    });
    world.send(b, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'i1',
    });
    world.send(a, VIBE_ROOM_C2S.SEND, {
      data: {
        x: 1,
      },
    });
    expect(all(b, VIBE_ROOM_S2C.MESSAGE)).toEqual([
      {
        fromSid: 'a',
        data: {
          x: 1,
        },
      },
    ]);
    expect(all(a, VIBE_ROOM_S2C.MESSAGE)).toEqual([]);

    world.send(a, VIBE_ROOM_C2S.SEND, {
      data: 'x'.repeat(2049),
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    world.send(a, VIBE_ROOM_C2S.SEND, {
      data: cyclic,
    });
    expect(all(b, VIBE_ROOM_S2C.MESSAGE)).toHaveLength(1);
    expect(errors(a)).toEqual(['TOO_LARGE', 'BAD_PAYLOAD']);
  });

  const stateIn = (s: Parameters<typeof all>[0]) => last<VibeRoomState>(s, VIBE_ROOM_S2C.STATE);

  it('a second join leaves the first room', () => {
    const a = world.connect('a', guest('a'));
    const b = world.connect('b', guest('b'));
    world.send(a, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'i1',
    });
    world.send(b, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'i1',
    });
    world.send(a, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'i2',
    });
    expect(stateIn(b)?.members.map((m) => m.sid)).toEqual(['b']);
    expect(stateIn(a)?.instanceId).toBe('i2');
    expect(a.rooms.has('vibe:room:i1')).toBe(false);
    expect(a.rooms.has('vibe:room:i2')).toBe(true);
  });

  it('a refused join into a full room leaves the socket in its current room', () => {
    for (let i = 0; i < 25; i += 1) {
      world.send(world.connect(`s${i}`, guest(`g${i}`)), VIBE_ROOM_C2S.JOIN, {
        instanceId: 'full',
      });
    }
    const a = world.connect('a', guest('a'));
    const b = world.connect('b', guest('b'));
    world.send(a, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'home',
    });
    world.send(b, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'home',
    });
    world.send(a, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'full',
    });
    expect(errors(a)).toEqual(['FULL']);
    expect(a.rooms.has('vibe:room:home')).toBe(true);
    expect(
      stateIn(b)
        ?.members.map((m) => m.sid)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('answers a malformed instance id with BAD_INSTANCE', () => {
    const a = world.connect('a', guest('a'));
    world.send(a, VIBE_ROOM_C2S.JOIN, {
      instanceId: 'no spaces allowed',
    });
    world.send(a, VIBE_ROOM_C2S.JOIN, {});
    expect(errors(a)).toEqual(['BAD_INSTANCE', 'BAD_INSTANCE']);
  });

  describe('Discord instance membership', () => {
    const fetchMock = vi.fn();
    const discordSocket = (id: string, discordId: string) =>
      world.connect(id, {
        ...guest(id),
        discordId,
      });
    const reply = (users: string[]) => ({
      ok: true,
      status: 200,
      json: async () => ({
        users,
      }),
    });
    const flush = () => new Promise((r) => setTimeout(r, 0));

    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
      setInstanceVerifierForTests(
        createInstanceVerifier({
          appId: 'app-1',
          botToken: 'bot-token',
          logger: {
            warn: () => {},
          },
        }),
      );
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      setInstanceVerifierForTests(null);
    });

    it('lets a user in who is in the instance, asking Discord with the bot token', async () => {
      fetchMock.mockResolvedValue(reply(['d1', 'd2']));
      const a = discordSocket('a', 'd1');
      world.send(a, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'inst-1',
      });
      await flush();
      expect(stateIn(a)?.instanceId).toBe('inst-1');
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://discord.com/api/v10/applications/app-1/activity-instances/inst-1',
      );
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bot bot-token');
      // Cached: the second member of the same instance costs no call.
      const b = discordSocket('b', 'd2');
      world.send(b, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'inst-1',
      });
      await flush();
      expect(stateIn(b)?.members).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('refuses a Discord user who is not in the instance, and an unknown instance', async () => {
      fetchMock.mockResolvedValueOnce(reply(['someone-else']));
      const a = discordSocket('a', 'd1');
      world.send(a, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'inst-2',
      });
      await flush();
      expect(errors(a)).toEqual(['BAD_INSTANCE']);
      expect(a.rooms.has('vibe:room:inst-2')).toBe(false);

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      });
      const b = discordSocket('b', 'd1');
      world.send(b, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'ghost',
      });
      await flush();
      expect(errors(b)).toEqual(['BAD_INSTANCE']);
      world.send(b, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'ghost',
      });
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(2); // the unknown instance is remembered
    });

    it('lets the join through on a transient Discord failure, and does not remember it', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });
      const a = discordSocket('a', 'd1');
      world.send(a, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'inst-3',
      });
      await flush();
      expect(errors(a)).toEqual([]);
      expect(stateIn(a)?.instanceId).toBe('inst-3');
      // Not remembered: a later non-member is still asked about, and refused.
      fetchMock.mockResolvedValueOnce(reply(['d1']));
      const b = discordSocket('b', 'd2');
      world.send(b, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'inst-3',
      });
      await flush();
      expect(errors(b)).toEqual(['BAD_INSTANCE']);
    });

    it('refuses a Discord user past their lookup budget', async () => {
      const verifier = createInstanceVerifier({
        appId: 'app-1',
        botToken: 'bot',
        logger: {
          warn: () => {},
        },
      });
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      });
      const verdicts = [];
      for (let i = 0; i < 21; i++) verdicts.push(await verifier.check('d9', `spray-${i}`));
      expect(fetchMock).toHaveBeenCalledTimes(20);
      expect(verdicts.at(-1)).toBe('over_budget');
      fetchMock.mockReset();
    });

    it('does not check a web-session socket, or anything without a bot token', async () => {
      const web = world.connect('w', {
        userId: 'u1',
        userName: 'U',
      });
      world.send(web, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'inst-4',
      });
      expect(stateIn(web)?.instanceId).toBe('inst-4');
      setInstanceVerifierForTests(
        createInstanceVerifier({
          appId: 'app-1',
          botToken: '',
          logger: {
            warn: () => {},
          },
        }),
      );
      const a = discordSocket('a', 'd1');
      world.send(a, VIBE_ROOM_C2S.JOIN, {
        instanceId: 'inst-5',
      });
      await flush();
      expect(stateIn(a)?.instanceId).toBe('inst-5');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

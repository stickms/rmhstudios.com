/**
 * Durable rmhbox lobbies (redesign D2 step 2): a deploy must not drop a
 * lobby — its seats, cumulative scores and chat — and a returning player must
 * get their slot back. Runs against the in-memory store; no Redis needed.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  Server,
  Socket,
} from 'socket.io';

vi.mock(
  'ioredis',
  () => ({
    default:
      vi.fn(),
  }),
);
import Redis from 'ioredis';

import {
  LobbyManager,
  RESTORED_SEQ_GAP,
} from '../lobby-manager';
import { StateSyncService } from '../state-sync';
import { ReconnectionHandler } from '../reconnection';
import { config } from '../config';
import {
  LOBBY_INDEX_KEY,
  LOBBY_KEY_PREFIX,
  LOBBY_TTL_SECONDS,
  MemoryLobbyStore,
  RedisLobbyStore,
  deserializeLobby,
  openLobbyStore,
  planRestore,
  serializeLobby,
} from '../lobby-store';
import {
  LobbyPersistence,
  SAVE_DEBOUNCE_MS,
} from '../lobby-persistence';
import { S2C } from '../../../lib/rmhbox/events';
import {
  MOCK_USERS,
  callEvent,
  createMockServer,
  createMockSocket,
  createPlayer,
  createSpectator,
  createTestLobby,
  findLastEmitted,
  findServerEmitted,
  registerSocket,
} from '../../../testing/rmhbox/phase-3/setup';
import type { MockSocketData } from '../../../testing/rmhbox/phase-3/setup';

const silentLogger =
  () => ({
    info: vi.fn(),
    warn: vi.fn(),
  });

beforeEach(
  () =>
    vi.useFakeTimers(),
);
afterEach(
  () =>
    vi.useRealTimers(),
);

describe('serializeLobby / deserializeLobby', () => {
  it('round-trips a lobby through JSON, dropping only process-bound state', () => {
    const lobby =
      createTestLobby(
        {
          state:
            'PLAYING',
          roundNumber: 3,
          chat: [
            {
              id: 'c1',
              userId:
                'system',
              userName:
                'System',
              content:
                'hi',
              timestamp: 1,
              type: 'system',
            },
          ],
          matchHistory:
            [
              {
                minigameId:
                  'rhyme-time',
                roundNumber: 2,
                startedAt: 10,
                endedAt: 20,
                standings:
                  [
                    {
                      userId:
                        MOCK_USERS
                          .alice
                          .userId,
                      userName:
                        'Alice',
                      score: 50,
                      rank: 1,
                    },
                  ],
              },
            ],
          selectedGame:
            {
              minigameId:
                'rhyme-time',
              displayName:
                'Rhyme Time',
            },
          resolvedGameSettings:
            {
              rounds: 3,
              hard: true,
            },
          discordChannelKey:
            'guild:chan',
          currentGame:
            {
              minigameId:
                'rhyme-time',
              handler:
                {} as never,
              startedAt: 5,
            },
        },
      );
    lobby.players.set(
      MOCK_USERS
        .alice
        .userId,
      createPlayer(
        MOCK_USERS.alice,
        {
          score: 120,
          roundScore: 40,
          isReady: true,
        },
      ),
    );
    lobby.players.set(
      MOCK_USERS
        .bob
        .userId,
      createPlayer(
        MOCK_USERS.bob,
        {
          score: 80,
        },
      ),
    );
    lobby.spectators.set(
      MOCK_USERS
        .charlie
        .userId,
      createSpectator(
        MOCK_USERS.charlie,
      ),
    );

    const json =
      JSON.stringify(
        serializeLobby(
          lobby,
          42,
        ),
      );
    expect(
      json,
    ).not.toContain(
      'socket-',
    );

    const decoded =
      deserializeLobby(
        JSON.parse(
          json,
        ),
      );
    expect(
      decoded,
    ).not.toBeNull();
    const {
      lobby:
        back,
      seq,
    } =
      decoded!;
    expect(
      seq,
    ).toBe(
      42,
    );
    expect(
      back.currentGame,
    ).toBeNull();
    expect(
      back.state,
    ).toBe(
      'PLAYING',
    );
    expect(
      back.roundNumber,
    ).toBe(
      3,
    );
    expect(
      back.chat,
    ).toEqual(
      lobby.chat,
    );
    expect(
      back.matchHistory,
    ).toEqual(
      lobby.matchHistory,
    );
    expect(
      back.settings,
    ).toEqual(
      lobby.settings,
    );
    expect(
      back.selectedGame,
    ).toEqual(
      lobby.selectedGame,
    );
    expect(
      back.resolvedGameSettings,
    ).toEqual(
      lobby.resolvedGameSettings,
    );
    expect(
      back.discordChannelKey,
    ).toBe(
      'guild:chan',
    );
    for (const [
      id,
      p,
    ] of lobby.players) {
      expect(
        back.players.get(
          id,
        ),
      ).toEqual(
        {
          ...p,
          socketId:
            null,
          isConnected: false,
        },
      );
    }
    expect(
      back.spectators.get(
        MOCK_USERS
          .charlie
          .userId,
      ),
    ).toEqual(
      {
        ...lobby.spectators.get(
          MOCK_USERS
            .charlie
            .userId,
        )!,
        socketId:
          null,
        isConnected: false,
      },
    );
  });

  it('rejects corrupt and wrong-version payloads without throwing', () => {
    const good =
      serializeLobby(
        createTestLobby(),
        1,
      );
    expect(
      deserializeLobby(
        undefined,
      ),
    ).toBeNull();
    expect(
      deserializeLobby(
        'nope',
      ),
    ).toBeNull();
    expect(
      deserializeLobby(
        {
          ...good,
          v: 2,
        },
      ),
    ).toBeNull();
    expect(
      deserializeLobby(
        {
          ...good,
          players:
            'x',
        },
      ),
    ).toBeNull();
  });
});

describe('planRestore', () => {
  it('puts a mid-game lobby back in WAITING and keeps cumulative scores and history', () => {
    const lobby =
      createTestLobby(
        {
          state:
            'PLAYING',
          roundNumber: 4,
          matchHistory:
            [],
        },
      );
    lobby.players.set(
      MOCK_USERS
        .alice
        .userId,
      createPlayer(
        MOCK_USERS.alice,
        {
          score: 300,
          roundScore: 90,
        },
      ),
    );
    lobby.players.set(
      MOCK_USERS
        .bob
        .userId,
      createPlayer(
        MOCK_USERS.bob,
        {
          score: 150,
          roundScore: 20,
          isReady: true,
        },
      ),
    );
    const {
      lobby:
        restored,
    } =
      deserializeLobby(
        JSON.parse(
          JSON.stringify(
            serializeLobby(
              lobby,
              9,
            ),
          ),
        ),
      )!;

    const plan =
      planRestore(
        restored,
        1_000,
      );
    expect(
      plan.restore,
    ).toBe(
      true,
    );
    if (
      !plan.restore
    )
      return;
    expect(
      plan.roundCancelled,
    ).toBe(
      true,
    );
    expect(
      restored.state,
    ).toBe(
      'WAITING',
    );
    expect(
      restored.currentGame,
    ).toBeNull();
    expect(
      restored.roundNumber,
    ).toBe(
      4,
    );
    expect(
      restored.lastActivityAt,
    ).toBe(
      1_000,
    );
    const alice =
      restored.players.get(
        MOCK_USERS
          .alice
          .userId,
      )!;
    const bob =
      restored.players.get(
        MOCK_USERS
          .bob
          .userId,
      )!;
    expect(
      [
        alice.score,
        alice.roundScore,
        alice.isReady,
      ],
    ).toEqual(
      [
        300,
        0,
        true,
      ],
    );
    expect(
      [
        bob.score,
        bob.roundScore,
        bob.isReady,
      ],
    ).toEqual(
      [
        150,
        0,
        false,
      ],
    );
  });

  it('does not bring back lobbies that were ending or empty', () => {
    expect(
      planRestore(
        createTestLobby(
          {
            state:
              'SESSION_RESULTS',
          },
        ),
      ),
    ).toEqual(
      {
        restore: false,
        reason:
          'ended',
      },
    );
    expect(
      planRestore(
        createTestLobby(),
      ),
    ).toEqual(
      {
        restore: false,
        reason:
          'empty',
      },
    );
  });
});

// ─── A real restart: manager A saves, manager B restores ─────────

function boot() {
  const serverData =
    createMockServer();
  const io =
    serverData.server as unknown as Server;
  const lobbyManager =
    new LobbyManager(
      io,
    );
  const stateSync =
    new StateSyncService(
      io,
      lobbyManager,
    );
  const reconnection =
    new ReconnectionHandler(
      io,
      lobbyManager,
      stateSync,
    );
  return {
    serverData,
    lobbyManager,
    reconnection,
  };
}

function connect(
  hub: ReturnType<
    typeof boot
  >,
  user: (typeof MOCK_USERS)[string],
): MockSocketData {
  const sock =
    createMockSocket(
      user,
    );
  registerSocket(
    hub.serverData,
    sock,
  );
  hub.reconnection.attemptReconnect(
    sock.socket as unknown as Socket,
  );
  hub.lobbyManager.handleConnection(
    sock.socket as unknown as Socket,
  );
  return sock;
}

async function runUntilShutdown(
  store: MemoryLobbyStore,
) {
  const hub =
    boot();
  const persistence =
    new LobbyPersistence(
      store,
      hub.lobbyManager,
      silentLogger(),
    );
  persistence.attach();

  const alice =
    connect(
      hub,
      MOCK_USERS.alice,
    );
  const bob =
    connect(
      hub,
      MOCK_USERS.bob,
    );
  const charlie =
    connect(
      hub,
      MOCK_USERS.charlie,
    );
  callEvent(
    alice,
    'rmhbox:lobby:create',
    {},
  );
  const lobbyId =
    (
      findLastEmitted(
        alice.emitted,
        S2C.LOBBY_CREATED,
      )!
        .data as {
        lobbyId: string;
      }
    )
      .lobbyId;
  callEvent(
    bob,
    'rmhbox:lobby:join',
    {
      lobbyId,
      asSpectator: false,
    },
  );
  callEvent(
    charlie,
    'rmhbox:lobby:join',
    {
      lobbyId,
      asSpectator: true,
    },
  );

  // Mid-round when the deploy lands.
  const lobby =
    hub.lobbyManager.getLobby(
      lobbyId,
    )!;
  lobby.state =
    'PLAYING';
  lobby.roundNumber = 2;
  lobby.players.get(
    MOCK_USERS
      .alice
      .userId,
  )!.score =
    300;
  lobby.players.get(
    MOCK_USERS
      .bob
      .userId,
  )!.score =
    120;
  lobby.players.get(
    MOCK_USERS
      .bob
      .userId,
  )!.roundScore =
    40;

  // The debounced save fires on its own.
  await vi.advanceTimersByTimeAsync(
    SAVE_DEBOUNCE_MS +
      10,
  );
  expect(
    store.entries.has(
      lobbyId,
    ),
  ).toBe(
    true,
  );

  const seqAtShutdown =
    hub.lobbyManager.getSeq(
      lobbyId,
    );
  hub.lobbyManager.shuttingDown = true;
  await persistence.shutdown();
  return {
    lobbyId,
    seqAtShutdown,
  };
}

describe('restart with durable lobbies', () => {
  it('restores the lobby, and a returning player gets their slot back', async () => {
    const store =
      new MemoryLobbyStore();
    const {
      lobbyId,
      seqAtShutdown,
    } =
      await runUntilShutdown(
        store,
      );
    expect(
      JSON.parse(
        store.entries.get(
          lobbyId,
        )!,
      )
        .state,
    ).toBe(
      'PLAYING',
    );

    const hub =
      boot();
    const persistence =
      new LobbyPersistence(
        store,
        hub.lobbyManager,
        silentLogger(),
      );
    persistence.attach();
    expect(
      await persistence.restore(),
    ).toEqual(
      {
        restored: 1,
        dropped: 0,
      },
    );

    const lobby =
      hub.lobbyManager.getLobby(
        lobbyId,
      )!;
    expect(
      lobby.state,
    ).toBe(
      'WAITING',
    );
    expect(
      lobby.roundNumber,
    ).toBe(
      2,
    );
    expect(
      lobby.players.get(
        MOCK_USERS
          .bob
          .userId,
      )!
        .score,
    ).toBe(
      120,
    );
    expect(
      lobby.players.get(
        MOCK_USERS
          .bob
          .userId,
      )!
        .roundScore,
    ).toBe(
      0,
    );
    expect(
      lobby.chat.at(
        -1,
      )!
        .content,
    ).toBe(
      'The server restarted; the round was cancelled.',
    );
    expect(
      hub.lobbyManager.getSeq(
        lobbyId,
      ),
    ).toBeGreaterThan(
      seqAtShutdown +
        RESTORED_SEQ_GAP -
        1,
    );
    for (const p of lobby.players.values())
      expect(
        p.isConnected,
      ).toBe(
        false,
      );

    // Alice comes back on a brand-new socket.
    const alice =
      connect(
        hub,
        MOCK_USERS.alice,
      );
    expect(
      findLastEmitted(
        alice.emitted,
        S2C.NOT_IN_LOBBY,
      ),
    ).toBeUndefined();
    const snapshot =
      findLastEmitted(
        alice.emitted,
        S2C.LOBBY_STATE_SNAPSHOT,
      )!
        .data as {
        lobbyId: string;
        seq: number;
        players: Array<{
          userId: string;
          score: number;
          isHost: boolean;
        }>;
      };
    expect(
      snapshot.lobbyId,
    ).toBe(
      lobbyId,
    );
    expect(
      snapshot.seq,
    ).toBeGreaterThan(
      seqAtShutdown,
    );
    expect(
      snapshot.players.find(
        (
          p,
        ) =>
          p.userId ===
          MOCK_USERS
            .alice
            .userId,
      ),
    ).toMatchObject(
      {
        score: 300,
        isHost: true,
      },
    );
    expect(
      alice.joinedRooms.has(
        `lobby:${lobbyId}:players`,
      ),
    ).toBe(
      true,
    );
    const aliceSeat =
      lobby.players.get(
        MOCK_USERS
          .alice
          .userId,
      )!;
    expect(
      aliceSeat.isConnected,
    ).toBe(
      true,
    );
    expect(
      aliceSeat.socketId,
    ).toBe(
      alice
        .socket
        .id,
    );

    // Bob and the spectator never return: the normal grace window removes
    // them, and the lobby carries on with Alice.
    await vi.advanceTimersByTimeAsync(
      config.DISCONNECT_GRACE_PERIOD_MS +
        10,
    );
    expect(
      lobby.players.has(
        MOCK_USERS
          .bob
          .userId,
      ),
    ).toBe(
      false,
    );
    expect(
      lobby
        .spectators
        .size,
    ).toBe(
      0,
    );
    expect(
      hub.lobbyManager.getLobbyByUserId(
        MOCK_USERS
          .bob
          .userId,
      ),
    ).toBeUndefined();
    expect(
      findServerEmitted(
        hub
          .serverData
          .emitted,
        S2C.GAME_ACTION,
      ).some(
        (
          e,
        ) =>
          (
            e.data as {
              type: string;
            }
          )
            .type ===
          'PLAYER_LEFT',
      ),
    ).toBe(
      true,
    );
    expect(
      hub.lobbyManager.getLobby(
        lobbyId,
      ),
    ).toBe(
      lobby,
    );
  });

  it('a restored lobby nobody returns to disbands and leaves the store', async () => {
    const store =
      new MemoryLobbyStore();
    const {
      lobbyId,
    } =
      await runUntilShutdown(
        store,
      );

    const hub =
      boot();
    const persistence =
      new LobbyPersistence(
        store,
        hub.lobbyManager,
        silentLogger(),
      );
    persistence.attach();
    await persistence.restore();
    expect(
      hub.lobbyManager.getLobby(
        lobbyId,
      ),
    ).toBeDefined();

    await vi.advanceTimersByTimeAsync(
      config.DISCONNECT_GRACE_PERIOD_MS +
        SAVE_DEBOUNCE_MS +
        10,
    );
    expect(
      hub.lobbyManager.getLobby(
        lobbyId,
      ),
    ).toBeUndefined();
    expect(
      hub.lobbyManager.getLobbyByUserId(
        MOCK_USERS
          .alice
          .userId,
      ),
    ).toBeUndefined();
    expect(
      store.entries.has(
        lobbyId,
      ),
    ).toBe(
      false,
    );
  });

  it('drops corrupt, wrong-version and ended entries instead of throwing', async () => {
    const store =
      new MemoryLobbyStore();
    const ended =
      createTestLobby(
        {
          id: 'ENDED1',
          state:
            'SESSION_RESULTS',
        },
      );
    ended.players.set(
      MOCK_USERS
        .alice
        .userId,
      createPlayer(
        MOCK_USERS.alice,
      ),
    );
    store.entries.set(
      'BAD001',
      '{not json',
    );
    store.entries.set(
      'OLD001',
      JSON.stringify(
        {
          ...serializeLobby(
            createTestLobby(
              {
                id: 'OLD001',
              },
            ),
            0,
          ),
          v: 0,
        },
      ),
    );
    store.entries.set(
      'ENDED1',
      JSON.stringify(
        serializeLobby(
          ended,
          3,
        ),
      ),
    );

    const hub =
      boot();
    const logger =
      silentLogger();
    const persistence =
      new LobbyPersistence(
        store,
        hub.lobbyManager,
        logger,
      );
    persistence.attach();
    await expect(
      persistence.restore(),
    ).resolves.toEqual(
      {
        restored: 0,
        dropped: 3,
      },
    );
    expect(
      store
        .entries
        .size,
    ).toBe(
      0,
    );
    expect(
      hub.lobbyManager.getLobbies()
        .size,
    ).toBe(
      0,
    );
    expect(
      logger.warn,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          event:
            'durable_lobby_corrupt',
          lobbyId:
            'BAD001',
        },
      ),
    );
  });
});

describe('openLobbyStore', () => {
  afterEach(
    () =>
      vi
        .mocked(
          Redis,
        )
        .mockClear(),
  );

  it('constructs nothing and logs nothing when RMHBOX_DURABLE_LOBBIES is unset', async () => {
    const logger =
      silentLogger();
    expect(
      await openLobbyStore(
        logger,
        {
          REDIS_STATE_URL:
            'redis://redis-state:6379',
        },
      ),
    ).toBeNull();
    expect(
      await openLobbyStore(
        logger,
        {
          RMHBOX_DURABLE_LOBBIES:
            '0',
          REDIS_STATE_URL:
            'redis://x:1',
        },
      ),
    ).toBeNull();
    expect(
      Redis,
    ).not.toHaveBeenCalled();
    expect(
      logger.info,
    ).not.toHaveBeenCalled();
    expect(
      logger.warn,
    ).not.toHaveBeenCalled();
  });

  it('stays off when REDIS_STATE_URL is unset, even with the flag on', async () => {
    const logger =
      silentLogger();
    expect(
      await openLobbyStore(
        logger,
        {
          RMHBOX_DURABLE_LOBBIES:
            '1',
          REDIS_URL:
            'redis://cache:6379',
        },
      ),
    ).toBeNull();
    expect(
      Redis,
    ).not.toHaveBeenCalled();
    expect(
      logger.info,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          event:
            'durable_lobbies_disabled',
        },
      ),
    );
  });

  it('a hub without a store installs no hooks', () => {
    const {
      lobbyManager,
    } =
      boot();
    expect(
      lobbyManager.onLobbyChanged,
    ).toBeUndefined();
    expect(
      lobbyManager.onLobbyRemoved,
    ).toBeUndefined();
  });
});

describe('RedisLobbyStore', () => {
  /** Just enough of ioredis for the store: strings with TTLs and one set. */
  function fakeRedis() {
    const strings =
      new Map<
        string,
        {
          value: string;
          ttl: number;
        }
      >();
    const sets =
      new Map<
        string,
        Set<string>
      >();
    const set =
      (
        k: string,
      ) =>
        sets.get(
          k,
        ) ??
        sets
          .set(
            k,
            new Set(),
          )
          .get(
            k,
          )!;
    const api =
      {
        strings,
        sets,
        set: (
          k: string,
          v: string,
          _ex: string,
          ttl: number,
        ) =>
          strings.set(
            k,
            {
              value:
                v,
              ttl,
            },
          ),
        sadd: (
          k: string,
          ...m: string[]
        ) =>
          m.forEach(
            (
              x,
            ) =>
              set(
                k,
              ).add(
                x,
              ),
          ),
        srem: async (
          k: string,
          ...m: string[]
        ) =>
          m.forEach(
            (
              x,
            ) =>
              set(
                k,
              ).delete(
                x,
              ),
          ),
        del: (
          k: string,
        ) =>
          strings.delete(
            k,
          ),
        smembers:
          async (
            k: string,
          ) =>
            Array.from(
              set(
                k,
              ),
            ),
        mget: async (
          ...ks: string[]
        ) =>
          ks.map(
            (
              k,
            ) =>
              strings.get(
                k,
              )
                ?.value ??
              null,
          ),
        multi() {
          const ops: Array<
            () => unknown
          > =
            [];
          const chain =
            {
              set: (
                ...a: Parameters<
                  typeof api.set
                >
              ) => (
                ops.push(
                  () =>
                    api.set(
                      ...a,
                    ),
                ),
                chain
              ),
              sadd: (
                ...a: Parameters<
                  typeof api.sadd
                >
              ) => (
                ops.push(
                  () =>
                    api.sadd(
                      ...a,
                    ),
                ),
                chain
              ),
              srem: (
                ...a: Parameters<
                  typeof api.srem
                >
              ) => (
                ops.push(
                  () =>
                    api.srem(
                      ...a,
                    ),
                ),
                chain
              ),
              del: (
                ...a: Parameters<
                  typeof api.del
                >
              ) => (
                ops.push(
                  () =>
                    api.del(
                      ...a,
                    ),
                ),
                chain
              ),
              exec: async () =>
                ops.map(
                  (
                    op,
                  ) => [
                    null,
                    op(),
                  ],
                ),
            };
          return chain;
        },
      };
    return api;
  }

  it('writes one TTL key per lobby plus the index, and prunes expired ids on load', async () => {
    const redis =
      fakeRedis();
    const store =
      new RedisLobbyStore(
        redis as never,
      );
    const lobby =
      createTestLobby(
        {
          id: 'ABC123',
        },
      );
    lobby.players.set(
      MOCK_USERS
        .alice
        .userId,
      createPlayer(
        MOCK_USERS.alice,
      ),
    );
    await store.save(
      serializeLobby(
        lobby,
        7,
      ),
    );

    expect(
      redis.strings.get(
        `${LOBBY_KEY_PREFIX}ABC123`,
      )!
        .ttl,
    ).toBe(
      LOBBY_TTL_SECONDS,
    );
    expect(
      redis.sets.get(
        LOBBY_INDEX_KEY,
      ),
    ).toEqual(
      new Set(
        [
          'ABC123',
        ],
      ),
    );

    redis.sets
      .get(
        LOBBY_INDEX_KEY,
      )!
      .add(
        'GONE00',
      ); // key expired, index not yet pruned
    const loaded =
      await store.loadAll();
    expect(
      loaded.map(
        (
          e,
        ) =>
          e.id,
      ),
    ).toEqual(
      [
        'ABC123',
      ],
    );
    expect(
      deserializeLobby(
        loaded[0]!
          .data,
      )!
        .seq,
    ).toBe(
      7,
    );
    expect(
      redis.sets.get(
        LOBBY_INDEX_KEY,
      ),
    ).toEqual(
      new Set(
        [
          'ABC123',
        ],
      ),
    );

    await store.remove(
      'ABC123',
    );
    expect(
      redis
        .strings
        .size,
    ).toBe(
      0,
    );
    expect(
      redis.sets.get(
        LOBBY_INDEX_KEY,
      )!
        .size,
    ).toBe(
      0,
    );
  });
});

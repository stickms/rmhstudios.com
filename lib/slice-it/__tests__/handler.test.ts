/**
 * Slice It — the lobby handler, driven end to end.
 *
 * The first two `describe`s are the reason this file exists.
 *
 * **Reconnect.** The old handler keyed seats by `socket.id`, so a two-second
 * network blip removed a player from the lobby permanently — mid-song, from
 * their point of view, the game just stopped mattering. Seats are keyed by
 * `userId` now and rebound on rejoin, and "the same account comes back on a new
 * socket and keeps its seat, its readiness and its score" is the single
 * property that whole change exists to buy. It is also invisible: nothing else
 * here fails if a rebind quietly creates a second seat instead.
 *
 * **Pause.** A drop mid-match holds the room, and the interesting parts are the
 * edges — that the hold releases when they return, that it expires and plays
 * on without them, that a flapping connection runs out of pauses, and that the
 * deadline moves by however long the room waited. Each of those is a `setTimeout`
 * the server owns, so they are driven with fake timers rather than waited on.
 *
 * The handler is driven through fake socket.io objects: the interesting surface
 * is the state machine, not the transport.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hub's Prisma client is touched by song lookup and the fire-and-forget
// results write. Stubbed so a test run never reaches for a database.
const song = {
  id: 'song-1',
  title: 'Test Track',
  artist: 'Nobody',
  coverUrl: null,
  duration: 120,
  bpm: 128,
};

/**
 * Every leaderboard row the handler tries to write.
 *
 * The multiplayer results write is the *second* path to a leaderboard row, and
 * the one that does not go through `/api/slice-it/score` — so what it does and
 * does not persist has to be observable.
 */
const written: { songId: string; userId: string; score: number; maxCombo: number }[] = [];

vi.mock('../../../server/socket-server/prisma-client', () => ({
  getPrismaClient: () => ({
    song: { findFirst: async () => song },
    songLeaderboard: {
      findUnique: async () => null,
      create: async ({ data }: { data: (typeof written)[number] }) => {
        written.push(data);
        return {};
      },
      update: async () => ({}),
    },
  }),
  disconnectPrisma: async () => {},
}));

import {
  __resetSliceItLobbies,
  handleSliceItDisconnect,
  registerSliceItHandlers,
} from '../../../server/socket-server/handlers/slice-it';
import {
  COUNTDOWN_SECONDS,
  MATCH_DISCONNECT_GRACE_MS,
  MAX_MATCH_PAUSES,
  RESUME_COUNTDOWN_SECONDS,
  SCORE_TICK_MS,
} from '../constants';
import { C2S, S2C } from '../net/events';
import type {
  ChatMessage,
  LiveScore,
  LobbyError,
  LobbySnapshot,
  MatchResults,
  PausePayload,
  PublicLobbyInfo,
  ResumePayload,
} from '../net/events';

/* ─── Fake socket.io ─────────────────────────────────────────────────────── */

interface Frame {
  event: string;
  payload: unknown;
}

class FakeSocket {
  readonly data: Record<string, unknown>;
  readonly rooms = new Set<string>();
  readonly frames: Frame[] = [];
  private readonly handlers = new Map<string, (payload: unknown) => void>();
  disconnected = false;

  constructor(
    readonly id: string,
    userId: string,
    userName: string,
  ) {
    this.data = { userId, userName, avatarUrl: null };
  }

  /**
   * Re-cast this socket as a Discord guest: no `userId` at all, a display name
   * and avatar on `socket.data.discordGuest`.
   *
   * That is exactly the shape `server/socket-server/index.ts`'s soft-auth
   * middleware leaves behind after verifying a Discord Activity token whose
   * account is not linked — the verification itself needs a live Discord API
   * and is not what these tests are about.
   */
  asGuest(name: string, avatarUrl: string | null = null): this {
    this.data.userId = undefined;
    this.data.userName = undefined;
    this.data.discordGuest = { name, avatarUrl };
    return this;
  }

  on(event: string, fn: (payload: unknown) => void): void {
    this.handlers.set(event, fn);
  }
  emit(event: string, payload: unknown): void {
    this.frames.push({ event, payload });
  }
  join(room: string): void {
    this.rooms.add(room);
  }
  leave(room: string): void {
    this.rooms.delete(room);
  }
  disconnect(): void {
    this.disconnected = true;
  }

  /** Deliver a client→server event, as socket.io would. */
  send(event: string, payload: unknown = {}): void {
    this.handlers.get(event)?.(payload);
  }

  last<T>(event: string): T | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].event === event) return this.frames[i].payload as T;
    }
    return undefined;
  }

  all<T>(event: string): T[] {
    return this.frames.filter((f) => f.event === event).map((f) => f.payload as T);
  }

  clear(): void {
    this.frames.length = 0;
  }
}

class FakeServer {
  readonly sockets = { sockets: new Map<string, FakeSocket>() };

  to(target: string) {
    const targets = [...this.sockets.sockets.values()].filter(
      (socket) => socket.id === target || socket.rooms.has(target),
    );
    const emit = (event: string, payload: unknown) => {
      for (const socket of targets) socket.emit(event, payload);
    };
    // `volatile` drops a packet rather than queueing it when a client's socket
    // is backed up — the live score broadcast uses it, because a stale score is
    // worth less than nothing once a newer one exists. Here every socket is
    // always ready, so it delivers; what the harness has to model is that the
    // property exists at all.
    return { emit, volatile: { emit } };
  }
}

/* ─── Harness ────────────────────────────────────────────────────────────── */

/**
 * Never reset between tests.
 *
 * The hub's rate limiter is keyed by `socketId:event` and lives for the process,
 * so reusing `s1` across tests accumulates against the same bucket — the tenth
 * test to create a lobby would be silently rate-limited and its `slice:lobby`
 * frame would simply never arrive.
 */
let nextSocket = 0;

function connect(io: FakeServer, name: string, userId?: string): FakeSocket {
  nextSocket++;
  const socket = new FakeSocket(`s${nextSocket}`, userId ?? `user-${nextSocket}`, name);
  io.sockets.sockets.set(socket.id, socket);
  registerSliceItHandlers(io as never, socket as never);
  return socket;
}

/** A Discord Activity guest: verified by the hub, but with no site account. */
function connectGuest(io: FakeServer, name: string): FakeSocket {
  nextSocket++;
  const socket = new FakeSocket(`s${nextSocket}`, '', name).asGuest(name);
  io.sockets.sockets.set(socket.id, socket);
  registerSliceItHandlers(io as never, socket as never);
  return socket;
}

function drop(io: FakeServer, socket: FakeSocket): void {
  io.sockets.sockets.delete(socket.id);
  handleSliceItDisconnect(io as never, socket as never);
}

interface Room {
  io: FakeServer;
  host: FakeSocket;
  guests: FakeSocket[];
  seats: FakeSocket[];
  code: string;
}

/** `slice:song` is async (it reads the row); let the microtask queue drain. */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

/**
 * A private lobby with a host, `guests` extra players, all ready, song chosen.
 *
 * The song is picked *before* anyone readies up, because choosing a track
 * clears every ready flag — you agreed to play a different song. Readying first
 * and picking second leaves the lobby unstartable, which is correct behaviour
 * and a broken fixture.
 */
async function makeLobby(guests = 1): Promise<Room> {
  const io = new FakeServer();
  const host = connect(io, 'Host');
  host.send(C2S.CREATE, { isPublic: false });
  const code = host.last<LobbySnapshot>(S2C.LOBBY)!.code;

  host.send(C2S.SONG, { songId: song.id });
  await flush();

  const others = Array.from({ length: guests }, (_, i) => connect(io, `P${i + 2}`));
  for (const guest of others) {
    guest.send(C2S.JOIN, { code });
    guest.send(C2S.READY, { ready: true });
  }

  return { io, host, guests: others, seats: [host, ...others], code };
}

/** Start the match and run out the load + countdown timers. */
function startMatch(room: Room): void {
  room.host.send(C2S.START);
  for (const seat of room.seats) seat.send(C2S.LOADED);
  vi.advanceTimersByTime(COUNTDOWN_SECONDS * 1000 + 50);
}

const snapshot = (socket: FakeSocket) => socket.last<LobbySnapshot>(S2C.LOBBY)!;

beforeEach(() => {
  vi.useFakeTimers();
  written.length = 0;
});

afterEach(() => {
  __resetSliceItLobbies();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ─── Reconnect ──────────────────────────────────────────────────────────── */

describe('reconnect', () => {
  it('keeps the seat when the same account rejoins on a new socket', async () => {
    const room = await makeLobby(1);
    const guest = room.guests[0];
    expect(snapshot(room.host).players).toHaveLength(2);

    drop(room.io, guest);
    // The seat is held, not removed — and the room can see they are gone.
    const held = snapshot(room.host);
    expect(held.players).toHaveLength(2);
    expect(held.players.find((p) => p.name === 'P2')?.disconnected).toBe(true);

    const returning = connect(room.io, 'P2', guest.data.userId as string);
    returning.send(C2S.JOIN, { code: room.code });

    const after = snapshot(room.host);
    expect(after.players).toHaveLength(2);
    expect(after.players.find((p) => p.name === 'P2')?.disconnected).toBe(false);
    // The readiness they set before dropping survives.
    expect(after.players.find((p) => p.name === 'P2')?.ready).toBe(true);
  });

  it('drops the seat once the grace window expires', async () => {
    const room = await makeLobby(1);
    drop(room.io, room.guests[0]);

    vi.advanceTimersByTime(MATCH_DISCONNECT_GRACE_MS + 1000);
    expect(snapshot(room.host).players).toHaveLength(1);
  });

  it('frees the seat immediately on a deliberate leave', async () => {
    const room = await makeLobby(1);
    room.guests[0].send(C2S.LEAVE);
    // No grace window: leaving is a decision, not an accident.
    expect(snapshot(room.host).players).toHaveLength(1);
  });

  it('migrates the host to a connected player when the host leaves', async () => {
    const room = await makeLobby(2);
    room.host.send(C2S.LEAVE);

    const after = snapshot(room.guests[0]);
    expect(after.players).toHaveLength(2);
    expect(after.players.filter((p) => p.isHost)).toHaveLength(1);
    expect(after.players.find((p) => p.isHost)?.name).toBe('P2');
  });

  it('destroys the lobby when the last seat goes', async () => {
    const room = await makeLobby(0);
    room.host.send(C2S.LEAVE);

    const rejoin = connect(room.io, 'Someone');
    rejoin.send(C2S.JOIN, { code: room.code });
    expect(rejoin.last<LobbyError>(S2C.ERROR)?.code).toBe('not_found');
  });
});

/* ─── Pause / resume ─────────────────────────────────────────────────────── */

describe('pause and resume', () => {
  it('pauses the match when a player drops mid-song', async () => {
    const room = await makeLobby(1);
    startMatch(room);
    room.host.clear();

    drop(room.io, room.guests[0]);

    const pause = room.host.last<PausePayload>(S2C.PAUSE);
    expect(pause).toBeTruthy();
    expect(pause!.peers.map((p) => p.userName)).toEqual(['P2']);
    expect(pause!.kickAt).toBeGreaterThan(Date.now());
    expect(pause!.pausesLeft).toBe(MAX_MATCH_PAUSES - 1);
  });

  it('resumes with a countdown when they come back in time', async () => {
    const room = await makeLobby(1);
    startMatch(room);
    const guest = room.guests[0];
    drop(room.io, guest);
    room.host.clear();

    vi.advanceTimersByTime(MATCH_DISCONNECT_GRACE_MS / 2);
    const returning = connect(room.io, 'P2', guest.data.userId as string);
    returning.send(C2S.JOIN, { code: room.code });

    const resume = room.host.last<ResumePayload>(S2C.RESUME);
    expect(resume).toBeTruthy();
    expect(resume!.countdownSeconds).toBe(RESUME_COUNTDOWN_SECONDS);
    // Nobody was dropped, so there is nobody to name.
    expect(resume!.droppedNames).toEqual([]);
    // A future timestamp: resuming a rhythm game the instant the socket
    // recovers drops the player into a note they could not have seen coming.
    expect(resume!.resumeAt).toBeGreaterThan(Date.now());
  });

  it('plays on without them when the window expires, and says who was dropped', async () => {
    const room = await makeLobby(1);
    startMatch(room);
    drop(room.io, room.guests[0]);
    room.host.clear();

    vi.advanceTimersByTime(MATCH_DISCONNECT_GRACE_MS + 100);

    const resume = room.host.last<ResumePayload>(S2C.RESUME);
    expect(resume).toBeTruthy();
    // This is the regression the ordering bug caused: the names were assigned
    // after `removeSeat` had already fired the resume, so the room was told
    // nothing about who it had just stopped waiting for.
    expect(resume!.droppedNames).toEqual(['P2']);
    expect(snapshot(room.host).players).toHaveLength(1);
  });

  it('stops honouring pauses once the budget is spent', async () => {
    const room = await makeLobby(1);
    startMatch(room);
    const userId = room.guests[0].data.userId as string;

    let socket = room.guests[0];
    for (let i = 0; i < MAX_MATCH_PAUSES; i++) {
      drop(room.io, socket);
      vi.advanceTimersByTime(1000);
      socket = connect(room.io, 'P2', userId);
      socket.send(C2S.JOIN, { code: room.code });
      vi.advanceTimersByTime(RESUME_COUNTDOWN_SECONDS * 1000 + 100);
    }

    room.host.clear();
    drop(room.io, socket);
    // One flapping connection cannot hold the room hostage indefinitely.
    expect(room.host.last<PausePayload>(S2C.PAUSE)).toBeUndefined();
  });

  it('extends the match deadline by however long it waited', async () => {
    const room = await makeLobby(1);
    startMatch(room);
    const guest = room.guests[0];

    drop(room.io, guest);
    const heldFor = MATCH_DISCONNECT_GRACE_MS / 2;
    vi.advanceTimersByTime(heldFor);
    connect(room.io, 'P2', guest.data.userId as string).send(C2S.JOIN, { code: room.code });
    vi.advanceTimersByTime(RESUME_COUNTDOWN_SECONDS * 1000 + 100);

    room.host.clear();
    // Without the extension the deadline would have fired by now; the song is
    // 120s and we have burned ~18s of it holding and re-counting.
    vi.advanceTimersByTime(song.duration * 1000);
    expect(room.host.last<MatchResults>(S2C.RESULTS)).toBeUndefined();
  });

  it('does not pause for a spectator dropping', async () => {
    const room = await makeLobby(1);
    startMatch(room);

    // Joining mid-match seats you as a spectator.
    const late = connect(room.io, 'Latecomer');
    late.send(C2S.JOIN, { code: room.code });
    expect(snapshot(room.host).players.find((p) => p.name === 'Latecomer')?.spectating).toBe(true);

    room.host.clear();
    drop(room.io, late);
    expect(room.host.last<PausePayload>(S2C.PAUSE)).toBeUndefined();
  });
});

/* ─── Lobby lifecycle ────────────────────────────────────────────────────── */

describe('lobby', () => {
  it('refuses to seat an unauthenticated socket', () => {
    const io = new FakeServer();
    const anon = new FakeSocket('anon', '', 'Anon');
    anon.data.userId = undefined;
    io.sockets.sockets.set(anon.id, anon);
    registerSliceItHandlers(io as never, anon as never);

    anon.send(C2S.CREATE, {});
    expect(anon.last<LobbyError>(S2C.ERROR)?.code).toBe('auth_required');
    expect(anon.last<LobbySnapshot>(S2C.LOBBY)).toBeUndefined();
  });

  it('mints its own lobby code rather than taking one from the client', () => {
    const io = new FakeServer();
    const host = connect(io, 'Host');
    host.send(C2S.CREATE, {});
    const code = host.last<LobbySnapshot>(S2C.LOBBY)!.code;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('resolves the song server-side from an id', async () => {
    const room = await makeLobby(1);
    // What the room is told is the row the server read, not an object the host
    // supplied — the old handler broadcast a client-provided `song` verbatim,
    // which let a host point everyone's audio element anywhere.
    expect(snapshot(room.guests[0]).song).toEqual(song);
  });

  it('lets only the host pick the song', async () => {
    const room = await makeLobby(1);
    room.guests[0].send(C2S.SONG, { songId: song.id });
    expect(room.guests[0].last<LobbyError>(S2C.ERROR)?.code).toBe('not_host');
  });

  it('clears everyone ready when the song changes', async () => {
    const room = await makeLobby(1);
    expect(snapshot(room.host).players.find((p) => p.name === 'P2')?.ready).toBe(true);

    room.host.send(C2S.SONG, { songId: song.id });
    await flush();
    // You agreed to play a different track.
    expect(snapshot(room.host).players.find((p) => p.name === 'P2')?.ready).toBe(false);
  });

  it('refuses to start without a song', () => {
    const io = new FakeServer();
    const host = connect(io, 'Host');
    host.send(C2S.CREATE, {});
    host.send(C2S.START);
    expect(host.last<LobbyError>(S2C.ERROR)?.code).toBe('no_song');
  });

  it('refuses to start while someone is not ready', async () => {
    const room = await makeLobby(1);
    room.guests[0].send(C2S.READY, { ready: false });
    room.host.send(C2S.START);
    expect(room.host.last<LobbyError>(S2C.ERROR)?.code).toBe('too_few_players');
  });

  it('clamps a modifier set to what multiplayer allows', async () => {
    const room = await makeLobby(1);
    room.guests[0].send(C2S.MODS, {
      modifiers: { speed: 0.5, suddenDeath: true, difficulty: 'expert' },
    });

    const seat = snapshot(room.host).players.find((p) => p.name === 'P2')!;
    // A slower chart in a race is a free easy mode; sudden death means watching
    // four minutes of other people playing.
    expect(seat.modifiers.speed).toBe(1);
    expect(seat.modifiers.suddenDeath).toBe(false);
    expect(seat.modifiers.difficulty).toBe('expert');
    // The multiplier the lobby shows is computed from the clamped set.
    expect(seat.scoreMultiplier).toBeCloseTo(1.5, 2);
  });

  it('lets the host remove a player, and not themselves', async () => {
    const room = await makeLobby(1);
    room.host.send(C2S.KICK, { socketId: room.host.id });
    expect(snapshot(room.host).players).toHaveLength(2);

    room.host.send(C2S.KICK, { socketId: room.guests[0].id });
    expect(room.guests[0].last<{ reason: string }>(S2C.KICKED)?.reason).toBe('removed_by_host');
    expect(snapshot(room.host).players).toHaveLength(1);
  });

  it('does not let a guest remove anyone', async () => {
    const room = await makeLobby(1);
    room.guests[0].send(C2S.KICK, { socketId: room.host.id });
    expect(room.guests[0].last<LobbyError>(S2C.ERROR)?.code).toBe('not_host');
    expect(snapshot(room.guests[0]).players).toHaveLength(2);
  });

  it('lists public lobbies and hides private ones', () => {
    const io = new FakeServer();
    const publicHost = connect(io, 'Public');
    publicHost.send(C2S.CREATE, { isPublic: true });
    const privateHost = connect(io, 'Private');
    privateHost.send(C2S.CREATE, { isPublic: false });

    const browser = connect(io, 'Browser');
    browser.send(C2S.BROWSE);
    const rows = browser.last<PublicLobbyInfo[]>(S2C.BROWSE_RESULT)!;
    expect(rows.map((r) => r.hostName)).toEqual(['Public']);
  });

  it('seats quickplay into an open public lobby', () => {
    const io = new FakeServer();
    const host = connect(io, 'Host');
    host.send(C2S.CREATE, { isPublic: true });
    const code = host.last<LobbySnapshot>(S2C.LOBBY)!.code;

    const joiner = connect(io, 'Joiner');
    joiner.send(C2S.QUICKPLAY);
    expect(joiner.last<LobbySnapshot>(S2C.LOBBY)!.code).toBe(code);
  });

  it('broadcasts chat to the room', async () => {
    const room = await makeLobby(1);
    room.guests[0].send(C2S.CHAT, { text: '  hello  ' });
    const message = room.host.last<ChatMessage>(S2C.CHAT)!;
    expect(message.text).toBe('hello');
    expect(message.name).toBe('P2');
  });

  it('drops an empty chat line rather than broadcasting it', async () => {
    const room = await makeLobby(1);
    room.host.clear();
    room.guests[0].send(C2S.CHAT, { text: '   ' });
    expect(room.host.last<ChatMessage>(S2C.CHAT)).toBeUndefined();
  });
});

/* ─── Match ──────────────────────────────────────────────────────────────── */

describe('match', () => {
  it('runs a countdown only once everyone reports loaded', async () => {
    const room = await makeLobby(1);
    room.host.send(C2S.START);
    room.host.send(C2S.LOADED);
    expect(room.host.last(S2C.COUNTDOWN)).toBeUndefined();

    room.guests[0].send(C2S.LOADED);
    expect(room.host.last(S2C.COUNTDOWN)).toBeTruthy();
  });

  it('batches live scores into one broadcast per tick', async () => {
    const room = await makeLobby(1);
    startMatch(room);
    room.host.clear();

    // Ten reports from each player between ticks.
    for (let i = 1; i <= 10; i++) {
      for (const seat of room.seats) {
        seat.send(C2S.SCORE, { score: i * 100, combo: i, maxCombo: i, accuracy: 1, health: 100 });
      }
    }
    expect(room.host.all(S2C.SCORES)).toHaveLength(0);

    vi.advanceTimersByTime(SCORE_TICK_MS + 10);
    const ticks = room.host.all<LiveScore[]>(S2C.SCORES);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toHaveLength(2);
    expect(ticks[0][0].score).toBe(1000);
  });

  it('publishes results once every racer finishes', async () => {
    const room = await makeLobby(1);
    startMatch(room);

    room.host.send(C2S.FINISH, {
      score: 5000,
      combo: 0,
      maxCombo: 40,
      accuracy: 0.9,
      health: 100,
    });
    expect(room.host.last(S2C.RESULTS)).toBeUndefined();

    room.guests[0].send(C2S.FINISH, {
      score: 9000,
      combo: 0,
      maxCombo: 80,
      accuracy: 0.98,
      health: 100,
    });

    const results = room.host.last<MatchResults>(S2C.RESULTS)!;
    expect(results.standings.map((s) => s.name)).toEqual(['P2', 'Host']);
    expect(results.standings.map((s) => s.place)).toEqual([1, 2]);
    expect(results.standings.every((s) => s.finished)).toBe(true);
  });

  it('gives tied scores the same place', async () => {
    const room = await makeLobby(2);
    startMatch(room);
    const report = { score: 100, combo: 0, maxCombo: 1, accuracy: 0.5, health: 100 };
    for (const seat of room.seats) seat.send(C2S.FINISH, report);

    const places = room.host.last<MatchResults>(S2C.RESULTS)!.standings.map((s) => s.place);
    expect(places).toEqual([1, 1, 1]);
  });

  it('closes the match at its deadline even if nobody reports a finish', async () => {
    const room = await makeLobby(1);
    startMatch(room);

    vi.advanceTimersByTime(song.duration * 1000 + 120_000);
    const results = room.host.last<MatchResults>(S2C.RESULTS)!;
    expect(results).toBeTruthy();
    // A player who never finished is recorded as such, not as a zero-score run.
    expect(results.standings.every((s) => s.finished)).toBe(false);
  });

  it('starts without a client that never finishes loading', async () => {
    const room = await makeLobby(1);
    room.host.send(C2S.START);
    room.host.send(C2S.LOADED);

    // The straggler's tab crashed. Ninety seconds later the room moves on
    // rather than hanging forever, which is what it used to do.
    vi.advanceTimersByTime(95_000);
    expect(room.host.last(S2C.COUNTDOWN)).toBeTruthy();
    expect(snapshot(room.host).players.find((p) => p.name === 'P2')?.spectating).toBe(true);
  });

  it('returns everyone to the lobby on a rematch, promoting spectators', async () => {
    const room = await makeLobby(1);
    startMatch(room);

    const late = connect(room.io, 'Latecomer');
    late.send(C2S.JOIN, { code: room.code });

    const report = { score: 10, combo: 0, maxCombo: 1, accuracy: 1, health: 100 };
    for (const seat of room.seats) seat.send(C2S.FINISH, report);

    room.host.send(C2S.REMATCH);
    const after = snapshot(room.host);
    expect(after.state).toBe('waiting');
    expect(after.players.every((p) => !p.spectating)).toBe(true);
    expect(after.players.every((p) => !p.ready)).toBe(true);
  });

  it('lets only the host call a rematch', async () => {
    const room = await makeLobby(1);
    startMatch(room);
    room.guests[0].send(C2S.REMATCH);
    expect(room.guests[0].last<LobbyError>(S2C.ERROR)?.code).toBe('not_host');
  });
});

/* ─── Guests (X10) ───────────────────────────────────────────────────────── */

/**
 * A Discord Activity player with no linked site account.
 *
 * Three properties, and the third is the one worth the file: a guest can play
 * (they used to get `auth_required` on every action), a guest's seat does not
 * survive a reconnect (the deliberate downgrade — the seat key is a socket id,
 * because the alternative is remembering them), and a guest's score is never
 * written anywhere. The last one is a privacy claim, and a privacy claim that
 * nothing checks is a comment.
 */
describe('guests', () => {
  it('lets a guest create a lobby and be seated with no userId', () => {
    const io = new FakeServer();
    const guest = connectGuest(io, 'Nyx');
    guest.send(C2S.CREATE, { isPublic: false });

    const snap = guest.last<LobbySnapshot>(S2C.LOBBY)!;
    expect(snap.players).toHaveLength(1);
    const seat = snap.players[0];
    expect(seat.userId).toBeNull();
    // The Discord display name and avatar, carried for the session only.
    expect(seat.guest).toEqual({ name: 'Nyx', avatarUrl: null });
    expect(seat.name).toBe('Nyx');
    // A guest who created the room still hosts it.
    expect(seat.isHost).toBe(true);
  });

  it('lets a guest join an account holder’s lobby, and seats them separately', async () => {
    const room = await makeLobby(0);
    const guest = connectGuest(room.io, 'Nyx');
    guest.send(C2S.JOIN, { code: room.code });

    const after = snapshot(room.host);
    expect(after.players).toHaveLength(2);
    expect(after.players.map((p) => p.name).sort()).toEqual(['Host', 'Nyx']);
    expect(after.players.find((p) => p.name === 'Nyx')?.userId).toBeNull();
    expect(after.players.find((p) => p.name === 'Host')?.userId).toBeTruthy();
  });

  it('seats two guests separately rather than collapsing them onto one key', async () => {
    const room = await makeLobby(0);
    connectGuest(room.io, 'Nyx').send(C2S.JOIN, { code: room.code });
    connectGuest(room.io, 'Vex').send(C2S.JOIN, { code: room.code });

    // Both have `userId: null`; keying seats on the userId alone would have
    // made the second guest overwrite the first.
    expect(snapshot(room.host).players).toHaveLength(3);
  });

  it('does NOT hold a guest seat across a reconnect', async () => {
    const room = await makeLobby(0);
    const guest = connectGuest(room.io, 'Nyx');
    guest.send(C2S.JOIN, { code: room.code });
    expect(snapshot(room.host).players).toHaveLength(2);

    drop(room.io, guest);

    // Gone at once, not held: a guest seat is keyed by socket id, so a
    // returning guest could never be matched back to it anyway. Holding it
    // would park a phantom the room waits on — and remembering them well
    // enough to do better is the thing X10 exists not to do.
    const after = snapshot(room.host);
    expect(after.players).toHaveLength(1);
    expect(after.players.find((p) => p.name === 'Nyx')).toBeUndefined();

    // And no grace timer fires later to remove an already-removed seat.
    vi.advanceTimersByTime(MATCH_DISCONNECT_GRACE_MS + 1000);
    expect(snapshot(room.host).players).toHaveLength(1);
  });

  it('does not pause a live match for a guest who drops', async () => {
    const room = await makeLobby(1);
    const guest = connectGuest(room.io, 'Nyx');
    guest.send(C2S.JOIN, { code: room.code });
    guest.send(C2S.READY, { ready: true });
    startMatch(room);
    room.host.clear();

    drop(room.io, guest);

    // There is nobody to wait for — the seat is already gone. Pausing would
    // hold four people for a player who cannot come back.
    expect(room.host.last<PausePayload>(S2C.PAUSE)).toBeUndefined();
  });

  it('writes no leaderboard row for a guest, and still writes one for the account beside them', async () => {
    const room = await makeLobby(0);
    const guest = connectGuest(room.io, 'Nyx');
    guest.send(C2S.JOIN, { code: room.code });
    guest.send(C2S.READY, { ready: true });
    startMatch({ ...room, seats: [room.host, guest] });

    const report = { score: 4000, combo: 0, maxCombo: 40, accuracy: 1, health: 100 };
    room.host.send(C2S.FINISH, report);
    guest.send(C2S.FINISH, { ...report, score: 9000 });
    await flush();

    // The guest placed first and it is shown…
    const results = room.host.last<MatchResults>(S2C.RESULTS)!;
    expect(results.standings[0].name).toBe('Nyx');
    expect(results.standings[0].place).toBe(1);
    expect(results.standings[0].score).toBe(9000);
    expect(results.standings[0].userId).toBeNull();

    // …and nothing about them was written down. Not a row with a null userId,
    // not a shadow account: no row at all.
    expect(written).toHaveLength(1);
    expect(written[0].score).toBe(4000);
    expect(written.every((row) => typeof row.userId === 'string' && row.userId)).toBe(true);
  });

  it('still refuses a socket with neither a session nor a Discord identity', () => {
    const io = new FakeServer();
    const anon = new FakeSocket('anon-2', '', 'Anon');
    anon.data.userId = undefined;
    io.sockets.sockets.set(anon.id, anon);
    registerSliceItHandlers(io as never, anon as never);

    // Guests widened who may play; they did not remove the check.
    anon.send(C2S.CREATE, {});
    expect(anon.last<LobbyError>(S2C.ERROR)?.code).toBe('auth_required');
  });
});

/* ─── Preferred lobby codes (X9) ─────────────────────────────────────────── */

/**
 * `slice:create` can be asked for a specific code.
 *
 * A Discord Activity derives one deterministically from its voice channel id so
 * a whole call lands in one lobby with nothing typed. The interesting case is
 * the collision: two participants racing to create the same derived code. It
 * has to be *answered*, because silently minting a random code instead looks
 * like success while leaving everyone else retrying a code that will never
 * exist — which was the pre-existing behaviour this replaces.
 */
describe('preferred lobby code', () => {
  it('honours a well-formed code that is free', () => {
    const io = new FakeServer();
    const host = connect(io, 'Host');
    host.send(C2S.CREATE, { isPublic: false, code: 'ABC123' });
    expect(host.last<LobbySnapshot>(S2C.LOBBY)!.code).toBe('ABC123');
  });

  it('answers code_taken rather than quietly minting a different code', () => {
    const io = new FakeServer();
    connect(io, 'First').send(C2S.CREATE, { isPublic: false, code: 'DUPES1' });

    const second = connect(io, 'Second');
    second.send(C2S.CREATE, { isPublic: false, code: 'DUPES1' });

    expect(second.last<LobbyError>(S2C.ERROR)?.code).toBe('code_taken');
    // Nothing was created: the caller wanted *that* room, and the useful next
    // move is to join it, not to sit alone in a room nobody else can find.
    expect(second.last<LobbySnapshot>(S2C.LOBBY)).toBeUndefined();
  });

  it('lets the loser of that race join the winner’s lobby', () => {
    const io = new FakeServer();
    connect(io, 'First').send(C2S.CREATE, { isPublic: false, code: 'RACE01' });

    const second = connect(io, 'Second');
    second.send(C2S.CREATE, { isPublic: false, code: 'RACE01' });
    second.send(C2S.JOIN, { code: 'RACE01' });

    expect(second.last<LobbySnapshot>(S2C.LOBBY)!.players).toHaveLength(2);
  });

  it('rejects a malformed code instead of falling back to a random one', () => {
    const io = new FakeServer();
    const host = connect(io, 'Host');
    // The schema strips to [A-Z0-9] and truncates, so this arrives as 'AB' —
    // short, not six characters, and therefore not a lobby code.
    host.send(C2S.CREATE, { isPublic: false, code: 'ab!' });

    expect(host.last<LobbyError>(S2C.ERROR)?.code).toBe('invalid_code');
    expect(host.last<LobbySnapshot>(S2C.LOBBY)).toBeUndefined();
  });

  it('still mints a random code when none is asked for', () => {
    const io = new FakeServer();
    const host = connect(io, 'Host');
    host.send(C2S.CREATE, { isPublic: false });
    expect(host.last<LobbySnapshot>(S2C.LOBBY)!.code).toMatch(/^[A-Z0-9]{6}$/);
  });
});

/* ─── Spectating (N1) ────────────────────────────────────────────────────── */

describe('spectating', () => {
  it('sends a snapshot immediately and takes no seat', async () => {
    const room = await makeLobby(1);
    const watcher = connect(room.io, 'Watcher');
    watcher.send(C2S.SPECTATE, { code: room.code });

    // They missed every transition that built this room, so they get the
    // current state rather than waiting for the next one.
    expect(watcher.last<LobbySnapshot>(S2C.LOBBY)!.code).toBe(room.code);
    // …and the roster is unchanged: a spectator is not a ninth player.
    expect(snapshot(room.host).players).toHaveLength(2);
  });

  it('receives the live score tick without occupying a slot', async () => {
    const room = await makeLobby(1);
    const watcher = connect(room.io, 'Watcher');
    watcher.send(C2S.SPECTATE, { code: room.code });
    startMatch(room);
    watcher.clear();

    for (const seat of room.seats) {
      seat.send(C2S.SCORE, { score: 700, combo: 7, maxCombo: 7, accuracy: 1, health: 100 });
    }
    vi.advanceTimersByTime(SCORE_TICK_MS + 10);

    const ticks = watcher.all<LiveScore[]>(S2C.SCORES);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toHaveLength(2);
  });

  it('sees the results without being in them', async () => {
    const room = await makeLobby(1);
    const watcher = connect(room.io, 'Watcher');
    watcher.send(C2S.SPECTATE, { code: room.code });
    startMatch(room);

    const report = { score: 100, combo: 0, maxCombo: 1, accuracy: 1, health: 100 };
    for (const seat of room.seats) seat.send(C2S.FINISH, report);

    const results = watcher.last<MatchResults>(S2C.RESULTS)!;
    expect(results.standings).toHaveLength(2);
    expect(results.standings.map((s) => s.name)).not.toContain('Watcher');
  });

  it('refuses to spectate a lobby that does not exist', () => {
    const io = new FakeServer();
    const watcher = connect(io, 'Watcher');
    watcher.send(C2S.SPECTATE, { code: 'NOPE12' });
    expect(watcher.last<LobbyError>(S2C.ERROR)?.code).toBe('not_found');
  });

  it('gives up a seat when a seated player starts spectating', async () => {
    const room = await makeLobby(1);
    room.guests[0].send(C2S.SPECTATE, { code: room.code });

    // Otherwise they would be both watched and waited on — counted in the
    // ready check for a match they are no longer playing.
    expect(snapshot(room.host).players).toHaveLength(1);
  });
});

/* ─── Leaderboard writes ─────────────────────────────────────────────────── */

/**
 * The multiplayer path writes leaderboard rows too, and it is the path that
 * does NOT go through `/api/slice-it/score`.
 *
 * `ScoreReportZ` deliberately bounds a live report only at
 * `Number.MAX_SAFE_INTEGER` — the running number is cosmetic, it drives the
 * opponent board and nothing else. That was fine until the same number reached
 * `songLeaderboard`, at which point one emit was a permanent global first place
 * past every ceiling the HTTP route exists to enforce. The fixture song is 120
 * seconds long, so the ceiling is derived from that.
 */
describe('leaderboard writes', () => {
  const finish = (room: Room, seat: FakeSocket, report: Partial<LiveScore> = {}) =>
    seat.send(C2S.FINISH, {
      score: 1000,
      combo: 0,
      maxCombo: 50,
      accuracy: 1,
      health: 100,
      ...report,
    });

  it('persists a plausible run', async () => {
    const room = await makeLobby(1);
    startMatch(room);
    for (const seat of room.seats) finish(room, seat);
    await flush();

    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({ songId: song.id, score: 1000, maxCombo: 50 });
  });

  it('refuses a forged score, and keeps the honest players in the same match', async () => {
    const room = await makeLobby(1);
    startMatch(room);

    finish(room, room.host, { score: Number.MAX_SAFE_INTEGER });
    finish(room, room.guests[0], { score: 2000 });
    await flush();

    // The cheat is dropped; the other player's row is unaffected.
    expect(written.map((row) => row.score)).toEqual([2000]);
  });

  it('refuses a forged combo as well as a forged score', async () => {
    const room = await makeLobby(1);
    startMatch(room);
    finish(room, room.host, { score: 500, maxCombo: 999_999 });
    finish(room, room.guests[0], { score: 500, maxCombo: 10 });
    await flush();

    expect(written.map((row) => row.maxCombo)).toEqual([10]);
  });
});

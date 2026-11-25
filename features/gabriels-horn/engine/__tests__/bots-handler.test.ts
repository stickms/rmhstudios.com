/**
 * Gabriel's Horn bots — the socket handler, driven end to end with computer players.
 *
 * What this pins, in the order the feature promises it:
 * - Only the host adds or removes a bot, only in a waiting lobby, within the
 *   seat cap, and both events are rate-limited (an event with no entry in
 *   `SOCKET_RATE_LIMITS` is not limited at all).
 * - One person and one bot can start a game.
 * - A bot acts on its own, soon after its phase opens, long before the clock.
 * - What a bot's decision receives is `viewFor` for its seat: on its own roll the
 *   faces are `null`, exactly as for a person.
 * - A table with a bot is a practice table: nothing is written to the board or
 *   the table read, while the same game between two people writes both.
 * - The last person leaving destroys the lobby, bots and their timers with it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  playerFindMany: vi.fn(async () => [] as unknown[]),
  playerCreate: vi.fn(async () => ({})),
  playerUpdate: vi.fn(async () => ({})),
  readUpsert: vi.fn(async () => ({})),
}));

vi.mock('../../../../server/socket-server/prisma-client', () => ({
  getPrismaClient: () => ({
    gabrielsHornPlayer: {
      findMany: db.playerFindMany,
      create: db.playerCreate,
      update: db.playerUpdate,
    },
    gabrielsHornTableRead: {
      upsert: db.readUpsert,
    },
  }),
  disconnectPrisma: async () => {},
}));

// Wraps the real decision function so a test can see exactly what a bot was handed.
const decisions = vi.hoisted(() => ({
  seen: [] as { view: unknown; expected: unknown }[],
  expectedFor: null as null | ((code: string, id: string) => unknown),
}));
vi.mock('../bot', async (importOriginal) => {
  const real = await importOriginal<typeof import('../bot')>();
  return {
    ...real,
    decideBotAction: (...args: Parameters<typeof real.decideBotAction>) => {
      const view = args[0];
      decisions.seen.push({
        view: JSON.parse(JSON.stringify(view)),
        expected: JSON.parse(JSON.stringify(decisions.expectedFor?.(view.code, view.selfSocketId) ?? null)),
      });
      return real.decideBotAction(...args);
    },
  };
});

import { config } from '../../../../server/socket-server/config';
import { registerGabrielsHornHandlers, handleGabrielsHornDisconnect, viewForSeatForTest } from '../../server/handlers';
import { BOT_LEVELS, MAX_PLAYERS, PHASE_MS } from '../constants';
import { C2S, S2C, type GameResults, type GameView, type LobbySnapshot, type PublicLobbyInfo } from '../net/events';

// ─── Fake socket.io (same shape as handler.test.ts) ─────────────────────────

class FakeSocket {
  readonly data: Record<string, unknown>;
  readonly rooms = new Set<string>();
  readonly frames: { event: string; payload: unknown }[] = [];
  private readonly handlers = new Map<string, (payload: unknown) => void>();

  constructor(
    readonly id: string,
    userId: string,
    userName: string,
  ) {
    this.data = { userId, userName, avatarUrl: null };
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
  send(event: string, payload: unknown = {}): void {
    this.handlers.get(event)?.(payload);
  }
  last<T>(event: string): T | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i]?.event === event) return this.frames[i]?.payload as T;
    }
    return undefined;
  }
  errors(): string[] {
    return this.frames.filter((f) => f.event === S2C.ERROR).map((f) => (f.payload as { message: string }).message);
  }
}

class FakeServer {
  readonly sockets = { sockets: new Map<string, FakeSocket>() };
  to(target: string) {
    const targets = [...this.sockets.sockets.values()].filter((s) => s.id === target || s.rooms.has(target));
    return { emit: (event: string, payload: unknown) => targets.forEach((s) => s.emit(event, payload)) };
  }
}

function seedRandom(seed: number): void {
  let state = seed >>> 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

let nextSocket = 0;
function connect(io: FakeServer, name: string): FakeSocket {
  const socket = new FakeSocket(`b${++nextSocket}`, `user-bots-${nextSocket}`, name);
  io.sockets.sockets.set(socket.id, socket);
  registerGabrielsHornHandlers(io as never, socket as never);
  return socket;
}

const lobbyOf = (socket: FakeSocket) => socket.last<LobbySnapshot>(S2C.LOBBY) as LobbySnapshot;
const viewOf = (socket: FakeSocket) => socket.last<GameView>(S2C.STATE) as GameView;

/** A private lobby with a host (and optionally more people), nobody dealt. */
function open(people = 1): { io: FakeServer; host: FakeSocket; guests: FakeSocket[]; code: string } {
  seedRandom(4242);
  const io = new FakeServer();
  const host = connect(io, 'Host');
  host.send(C2S.CREATE, { isPublic: false });
  const code = lobbyOf(host).code;
  const guests = Array.from({ length: people - 1 }, (_, i) => {
    const guest = connect(io, `Guest${i + 1}`);
    guest.send(C2S.JOIN, { code });
    guest.send(C2S.READY, { ready: true });
    return guest;
  });
  return { io, host, guests, code };
}

function startAndDeal(host: FakeSocket): void {
  host.send(C2S.START);
  vi.advanceTimersByTime(10_000);
}

/** One step for a person: do whatever their view asks, honestly and quickly. */
function actFor(seat: FakeSocket): void {
  const view = viewOf(seat);
  if (!view || view.phase === 'over') return;
  const me = view.selfSocketId;
  if (view.phase === 'action' && view.activeSocketId === me) {
    seat.send(C2S.SOUND_END);
    seat.send(C2S.ROLL);
  } else if (view.phase === 'claim' && view.activeSocketId !== me) {
    const mine = view.claims.find((c) => c.socketId === me);
    if (mine && mine.total === null) seat.send(C2S.CLAIM, { total: view.dice.total });
  } else if (view.phase === 'call' && view.activeSocketId === me) {
    const target = view.claims[0];
    if (target) seat.send(C2S.CALL, { targetSocketId: target.socketId, verdict: 'lie' });
  } else if (view.phase === 'final' && view.activeSocketId === me) {
    seat.send(C2S.PASS);
  }
}

/** Run a game to its results, people acting each second, bots on their own timers. */
function playOut(people: FakeSocket[]): GameResults {
  for (let step = 0; step < 6000; step++) {
    for (const seat of people) actFor(seat);
    vi.advanceTimersByTime(1000);
    const results = people[0]?.last<GameResults>(S2C.RESULTS);
    if (results) return results;
  }
  throw new Error('the game never finished');
}

beforeEach(() => {
  vi.useFakeTimers();
  decisions.seen.length = 0;
  decisions.expectedFor = null;
  for (const fn of Object.values(db)) fn.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Adding and removing ────────────────────────────────────────────────────

describe('adding and removing bots', () => {
  it('has a rate limit for both events', () => {
    expect(config.SOCKET_RATE_LIMITS[C2S.ADD_BOT]).toEqual({ max: 20, windowMs: 60_000 });
    expect(config.SOCKET_RATE_LIMITS[C2S.REMOVE_BOT]).toEqual({ max: 20, windowMs: 60_000 });
  });

  it('rate-limits both events once the allowance is spent', () => {
    const { host } = open();
    for (let i = 0; i < 25; i++) host.send(C2S.ADD_BOT, { level: 'easy' });
    expect(host.errors()).toContain('rate-limited');
    for (let i = 0; i < 25; i++) host.send(C2S.REMOVE_BOT, { seatId: 'bot:1' });
    expect(host.errors().filter((e) => e === 'rate-limited').length).toBeGreaterThan(1);
  });

  it('seats a bot with a bot:<n> id, no name and no user', () => {
    const { host } = open();
    host.send(C2S.ADD_BOT, { level: 'steady' });
    const bots = lobbyOf(host).players.filter((p) => p.bot);
    expect(bots).toEqual([
      expect.objectContaining({
        socketId: 'bot:1',
        userId: '',
        name: '',
        ready: true,
        isHost: false,
        bot: { n: 1, level: 'steady' },
      }),
    ]);
    expect(lobbyOf(host).practice).toBe(true);
  });

  it('refuses everyone but the host', () => {
    const { host, guests } = open(2);
    const guest = guests[0] as FakeSocket;
    guest.send(C2S.ADD_BOT, { level: 'easy' });
    expect(guest.errors()).toContain('host-only');
    host.send(C2S.ADD_BOT, { level: 'easy' });
    guest.send(C2S.REMOVE_BOT, { seatId: 'bot:1' });
    expect(guest.errors().filter((e) => e === 'host-only')).toHaveLength(2);
    expect(lobbyOf(host).players.filter((p) => p.bot)).toHaveLength(1);
  });

  it('refuses a level that does not exist', () => {
    const { host } = open();
    host.send(C2S.ADD_BOT, { level: 'godlike' });
    host.send(C2S.ADD_BOT, {});
    expect(host.errors().filter((e) => e === 'invalid-bot-level')).toHaveLength(2);
    expect(lobbyOf(host).players).toHaveLength(1);
  });

  it('adds and removes only while the lobby is waiting', () => {
    const { host } = open();
    host.send(C2S.ADD_BOT, { level: 'easy' });
    host.send(C2S.START);
    // Counting down.
    host.send(C2S.ADD_BOT, { level: 'easy' });
    host.send(C2S.REMOVE_BOT, { seatId: 'bot:1' });
    vi.advanceTimersByTime(10_000);
    host.send(C2S.ADD_BOT, { level: 'easy' });
    host.send(C2S.REMOVE_BOT, { seatId: 'bot:1' });
    expect(host.errors().filter((e) => e === 'not-waiting')).toHaveLength(4);
    expect(viewOf(host).players).toHaveLength(2);
  });

  it('never seats more than MAX_PLAYERS', () => {
    const { host } = open();
    for (let i = 0; i < 10; i++) host.send(C2S.ADD_BOT, { level: BOT_LEVELS[i % 3] });
    expect(lobbyOf(host).players).toHaveLength(MAX_PLAYERS);
    expect(host.errors()).toContain('lobby-full');
  });

  it('removing a bot frees its seat for a person', () => {
    const { io, host, code } = open();
    for (let i = 0; i < 5; i++) host.send(C2S.ADD_BOT, { level: 'easy' });
    const guest = connect(io, 'Late');
    guest.send(C2S.JOIN, { code });
    expect(guest.errors()).toContain('lobby-full');

    host.send(C2S.REMOVE_BOT, { seatId: 'bot:3' });
    expect(
      lobbyOf(host)
        .players.filter((p) => p.bot)
        .map((p) => p.bot?.n),
    ).toEqual([1, 2, 4, 5]);
    guest.send(C2S.JOIN, { code });
    expect(lobbyOf(host).players.some((p) => p.name === 'Late')).toBe(true);
    expect(lobbyOf(host).players).toHaveLength(MAX_PLAYERS);
  });

  it('removing ignores a seat that is a person', () => {
    const { host, guests } = open(2);
    host.send(C2S.REMOVE_BOT, { seatId: (guests[0] as FakeSocket).id });
    expect(lobbyOf(host).players).toHaveLength(2);
  });

  it('a public lobby lists how many of its seats are bots', () => {
    seedRandom(1);
    const io = new FakeServer();
    const host = connect(io, 'Host');
    host.send(C2S.CREATE, { isPublic: true });
    host.send(C2S.ADD_BOT, { level: 'easy' });
    host.send(C2S.ADD_BOT, { level: 'sharp' });
    const browser = connect(io, 'Browser');
    browser.send(C2S.BROWSE);
    const list = browser.last<PublicLobbyInfo[]>(S2C.BROWSE_RESULT) as PublicLobbyInfo[];
    expect(list).toEqual([expect.objectContaining({ playerCount: 3, bots: 2, maxPlayers: MAX_PLAYERS })]);
  });
});

// ─── Playing ────────────────────────────────────────────────────────────────

describe('a table with a bot', () => {
  it('names seats in the log by public seat number, never by socket id', () => {
    const { host } = open();
    host.send(C2S.ADD_BOT, { level: 'steady' });
    startAndDeal(host);
    const view = viewOf(host);
    const entries = JSON.stringify(view.log);
    expect(entries).not.toMatch(/SocketId/);
    expect(entries).not.toContain('bot:1');
    expect(view.players.map((p) => p.seatNo)).toEqual([1, 2]);
  });

  it('starts with one person and one bot', () => {
    const { host } = open();
    host.send(C2S.START);
    expect(host.errors()).toContain('need-more-players');
    host.send(C2S.ADD_BOT, { level: 'steady' });
    startAndDeal(host);
    const view = viewOf(host);
    expect(view.phase).not.toBe('over');
    expect(view.players.map((p) => p.bot)).toEqual([null, { n: 1, level: 'steady' }]);
    expect(view.players[1]?.name).toBe('');
    expect(view.practice).toBe(true);
    expect(view.players.every((p) => p.handCount > 0)).toBe(true);
  });

  it('acts soon after its phase opens, long before the clock runs out', () => {
    const { host } = open();
    host.send(C2S.ADD_BOT, { level: 'easy' });
    startAndDeal(host);
    // The host rolls; the bot is the only one who has to claim.
    expect(viewOf(host).activeSocketId).toBe(host.id);
    host.send(C2S.ROLL);
    expect(viewOf(host).phase).toBe('claim');
    expect(viewOf(host).claims.every((c) => c.total === null)).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(viewOf(host).phase).toBe('call');
    expect(viewOf(host).claims[0]?.total).not.toBeNull();

    host.send(C2S.CALL, { targetSocketId: 'bot:1', verdict: 'lie' });
    vi.advanceTimersByTime(PHASE_MS.reveal);
    // Now the bot is on turn: it must roll by itself, and the host must then
    // be asked to claim, all well inside the 45 s action clock.
    expect(viewOf(host).activeSocketId).toBe('bot:1');
    vi.advanceTimersByTime(5_000);
    expect(viewOf(host).phase).toBe('claim');
    expect(viewOf(host).activeSocketId).toBe('bot:1');
  });

  it('is never handed more than its own seat’s view, and rolls blind', () => {
    const { host, code } = open();
    decisions.expectedFor = (c, id) => viewForSeatForTest(c, id);
    // Easy never buys a look with Azure, so its roll is blind throughout.
    host.send(C2S.ADD_BOT, { level: 'easy' });
    startAndDeal(host);
    host.send(C2S.ROLL);
    vi.advanceTimersByTime(2_000);
    host.send(C2S.CALL, { targetSocketId: 'bot:1', verdict: 'lie' });
    vi.advanceTimersByTime(PHASE_MS.reveal);
    // The bot rolls; the host claims; the bot must decide a call without the dice.
    vi.advanceTimersByTime(5_000);
    const hostView = viewOf(host);
    expect(hostView.phase).toBe('claim');
    // The host sees the faces on the bot's roll; the bot's own view does not.
    expect(hostView.dice.faces).toHaveLength(3);
    host.send(C2S.CLAIM, { total: hostView.dice.total });
    vi.advanceTimersByTime(5_000);

    expect(decisions.seen.length).toBeGreaterThan(2);
    for (const { view, expected } of decisions.seen) {
      expect(view).toEqual(expected);
      expect((view as GameView).code).toBe(code);
    }
    const botRolls = decisions.seen.filter(({ view }) => {
      const v = view as GameView;
      return v.activeSocketId === 'bot:1' && (v.phase === 'action' || v.phase === 'call');
    });
    expect(botRolls.length).toBeGreaterThanOrEqual(2);
    for (const { view } of botRolls) {
      const dice = (view as GameView).dice;
      expect(dice.glimpsed).toBe(false);
      expect(dice.faces).toBeNull();
      expect(dice.total).toBeNull();
    }
    // Nothing the bot was ever handed contained a hand but its own.
    const raw = JSON.stringify(decisions.seen.map((d) => d.view));
    expect(raw).not.toContain('"trueTotal"');
  });

  it('writes nothing to the board or the table read, where two people do', () => {
    // Control: two people, same driver. The harness does see their writes.
    const human = open(2);
    startAndDeal(human.host);
    playOut([human.host, ...human.guests]);
    expect(db.playerFindMany).toHaveBeenCalled();
    expect(db.readUpsert).toHaveBeenCalled();

    for (const fn of Object.values(db)) fn.mockClear();

    const { host } = open();
    host.send(C2S.ADD_BOT, { level: 'steady' });
    host.send(C2S.ADD_BOT, { level: 'easy' });
    startAndDeal(host);
    const results = playOut([host]);
    expect(results.abandoned).toBe(false);
    expect(results.practice).toBe(true);
    expect(results.standings.map((s) => s.bot)).toContainEqual({ n: 1, level: 'steady' });
    vi.advanceTimersByTime(1_000);
    expect(db.playerFindMany).not.toHaveBeenCalled();
    expect(db.playerCreate).not.toHaveBeenCalled();
    expect(db.playerUpdate).not.toHaveBeenCalled();
    expect(db.readUpsert).not.toHaveBeenCalled();
  });

  it('keeps its seat, ready, after the game and plays a rematch', () => {
    const { host } = open();
    host.send(C2S.ADD_BOT, { level: 'easy' });
    startAndDeal(host);
    playOut([host]);
    const lobby = lobbyOf(host);
    expect(lobby.state).toBe('waiting');
    expect(lobby.players.find((p) => p.bot)?.ready).toBe(true);
    host.send(C2S.START);
    expect(host.errors()).not.toContain('not-everyone-ready');
  });
});

// ─── Leaving ────────────────────────────────────────────────────────────────

describe('the last person leaving', () => {
  it('destroys a waiting lobby that still has bots in it', () => {
    const { io, host, code } = open();
    host.send(C2S.ADD_BOT, { level: 'easy' });
    host.send(C2S.ADD_BOT, { level: 'easy' });
    host.send(C2S.LEAVE);
    const next = connect(io, 'Next');
    next.send(C2S.JOIN, { code });
    expect(next.errors()).toContain('lobby-not-found');
  });

  it('destroys a running table and clears every bot timer', () => {
    const { io, host, code } = open();
    host.send(C2S.ADD_BOT, { level: 'steady' });
    host.send(C2S.ADD_BOT, { level: 'sharp' });
    const baseline = vi.getTimerCount();
    startAndDeal(host);
    host.send(C2S.ROLL);
    expect(vi.getTimerCount()).toBeGreaterThan(baseline);
    host.send(C2S.LEAVE);
    expect(vi.getTimerCount()).toBe(baseline);
    const next = connect(io, 'Next');
    next.send(C2S.JOIN, { code });
    expect(next.errors()).toContain('lobby-not-found');
  });

  it('ends a running table when every person has dropped, rather than playing bots on', () => {
    const { io, host, code } = open();
    host.send(C2S.ADD_BOT, { level: 'easy' });
    host.send(C2S.ADD_BOT, { level: 'easy' });
    const baseline = vi.getTimerCount();
    startAndDeal(host);
    handleGabrielsHornDisconnect(io as never, host as never);
    expect(vi.getTimerCount()).toBe(baseline);
    const next = connect(io, 'Next');
    next.send(C2S.JOIN, { code });
    expect(next.errors()).toContain('lobby-not-found');
  });

  it('hands the host seat to a person, never to a bot', () => {
    const { host, guests } = open(2);
    host.send(C2S.ADD_BOT, { level: 'easy' });
    host.send(C2S.LEAVE);
    const guest = guests[0] as FakeSocket;
    const lobby = lobbyOf(guest);
    expect(lobby.hostSocketId).toBe(guest.id);
    expect(lobby.players.find((p) => p.isHost)?.bot).toBeNull();
  });
});

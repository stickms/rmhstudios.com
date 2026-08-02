/**
 * Gabriel's Horn — the socket handler, driven end to end.
 *
 * The first `describe` below is the reason this file exists. The game's entire
 * premise is that the player rolling cannot see the dice, and that premise is
 * only as real as the payload the server sends. A refactor that swapped the
 * per-seat `emitState` loop for a single `io.to(room).emit(STATE, …)` — which
 * is what every other handler in this directory does, and would look like a
 * tidy-up in review — would hand the roller the faces and break the game in a
 * way nothing else here would notice: the UI would keep drawing question marks,
 * every test of the rules would keep passing, and one person reading their own
 * WebSocket frames would win every round for the rest of the match.
 *
 * So: the roller's frames are asserted to contain no dice, in the two places
 * they could leak (the state payload and the shared log), and the one legal way
 * to see them (an Azure card) is asserted to actually work.
 *
 * The rest exercises the rules that are easy to get subtly wrong: who pays for
 * a call, that a seven trades hands after its own draw, and the backfire that
 * gives the horn its teeth.
 *
 * The handler is driven through fake socket.io objects rather than a real
 * server — the interesting surface is the state machine, not the transport.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hub's Prisma client is only touched by the fire-and-forget results write.
// Stubbed so a test run never reaches for a database.
vi.mock('../../../server/socket-server/prisma-client', () => ({
  getPrismaClient: () => ({
    gabrielsHornPlayer: {
      findUnique: async () => null,
      create: async () => ({}),
      update: async () => ({}),
    },
  }),
  disconnectPrisma: async () => {},
}));

import {
  registerGabrielsHornHandlers,
  handleGabrielsHornDisconnect,
} from '../../../server/socket-server/handlers/gabriels-horn';
import {
  PENALTY_DRAW,
  PHASE_MS,
  RECONNECT_GRACE_MS,
  STARTING_HAND,
  SWAP_RANK,
  effectOf,
} from '../constants';
import { C2S, S2C, type GameView, type GameResults, type LobbySnapshot } from '../net/events';

// ─── Fake socket.io ─────────────────────────────────────────────────────────

interface Frame {
  event: string;
  payload: unknown;
}

class FakeSocket {
  readonly data: Record<string, unknown>;
  readonly rooms = new Set<string>();
  readonly frames: Frame[] = [];
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

  /** Deliver a client→server event, as socket.io would. */
  send(event: string, payload: unknown = {}): void {
    this.handlers.get(event)?.(payload);
  }

  /** The most recent frame of a kind, or undefined. */
  last<T>(event: string): T | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].event === event) return this.frames[i].payload as T;
    }
    return undefined;
  }

  all<T>(event: string): T[] {
    return this.frames.filter((f) => f.event === event).map((f) => f.payload as T);
  }
}

class FakeServer {
  readonly sockets = { sockets: new Map<string, FakeSocket>() };

  /** `to()` takes either a room name or a socket id — the handler uses both. */
  to(target: string) {
    const targets = [...this.sockets.sockets.values()].filter(
      (socket) => socket.id === target || socket.rooms.has(target),
    );
    return {
      emit: (event: string, payload: unknown) => {
        for (const socket of targets) socket.emit(event, payload);
      },
    };
  }
}

// ─── A seeded deck ──────────────────────────────────────────────────────────

/**
 * The handler shuffles and rolls with `Math.random`, so stubbing it makes both
 * the deal and the dice reproducible. mulberry32 — small, well-distributed, and
 * enough for a deck.
 */
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

// ─── Harness ────────────────────────────────────────────────────────────────

interface Table {
  io: FakeServer;
  seats: FakeSocket[];
  /** This seat's latest personalised view. */
  view(socket: FakeSocket): GameView;
  /** Whoever the view says is on turn. */
  active(): FakeSocket;
  others(): FakeSocket[];
}

let nextSocket = 0;

function connect(io: FakeServer, name: string): FakeSocket {
  const socket = new FakeSocket(`s${++nextSocket}`, `user-${nextSocket}`, name);
  io.sockets.sockets.set(socket.id, socket);
  registerGabrielsHornHandlers(io as never, socket as never);
  return socket;
}

/** A private lobby with `count` seats, dealt and on the first player's turn. */
function deal(count: number, seed = 1234): Table {
  seedRandom(seed);
  const io = new FakeServer();
  const seats = Array.from({ length: count }, (_, i) => connect(io, `P${i + 1}`));

  seats[0].send(C2S.CREATE, { isPublic: false });
  const code = seats[0].last<LobbySnapshot>(S2C.LOBBY)?.code;
  expect(code).toBeTruthy();

  for (const seat of seats.slice(1)) {
    seat.send(C2S.JOIN, { code });
    seat.send(C2S.READY, { ready: true });
  }
  seats[0].send(C2S.START);
  // The deal is behind a countdown.
  vi.advanceTimersByTime(1000 * 10);

  const table: Table = {
    io,
    seats,
    view: (socket) => {
      const view = socket.last<GameView>(S2C.STATE);
      expect(view, `${socket.id} has no state`).toBeTruthy();
      return view as GameView;
    },
    active: () => {
      const id = table.view(seats[0]).activeSocketId;
      const socket = seats.find((s) => s.id === id);
      expect(socket, 'active seat is not at the table').toBeTruthy();
      return socket as FakeSocket;
    },
    others: () => {
      const id = table.view(seats[0]).activeSocketId;
      return seats.filter((s) => s.id !== id);
    },
  };
  return table;
}

/** Everyone but the roller says `total`; the phase advances to `call`. */
function everyoneClaims(table: Table, total: (seat: FakeSocket) => number): void {
  for (const seat of table.others()) seat.send(C2S.CLAIM, { total: total(seat) });
}

function handCount(table: Table, socket: FakeSocket): number {
  const me = table.view(socket).players.find((p) => p.socketId === socket.id);
  return me?.handCount ?? -1;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── The secret ─────────────────────────────────────────────────────────────

describe("Gabriel's Horn — the roller cannot see the dice", () => {
  it('sends the faces to every seat except the one that rolled', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);

    expect(table.view(roller).dice.faces).toBeNull();
    expect(table.view(roller).dice.total).toBeNull();

    for (const seat of table.others()) {
      const dice = table.view(seat).dice;
      expect(dice.faces).toHaveLength(3);
      expect(dice.total).toBe((dice.faces as number[]).reduce((a, b) => a + b, 0));
    }
  });

  it('never puts a die or a total in any frame the roller receives', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);
    // Claims are public — including a truthful one — so the check is that
    // nothing tells the roller WHICH of them is the real total.
    everyoneClaims(table, () => 11);

    const truth = table.view(table.others()[0]).dice.total as number;
    const serialised = JSON.stringify(roller.frames);
    // The log is the subtle one: it is shared, so a roll entry that carried a
    // total would leak through it rather than through `dice`.
    for (const entry of table.view(roller).log) {
      expect(entry.kind === 'roll' && entry.total !== undefined).toBe(false);
    }
    expect(serialised).not.toContain(`"trueTotal":${truth}`);
    expect(table.view(roller).claims.every((c) => c.lie === null)).toBe(true);
  });

  it('reveals the faces to the roller once the call is resolved', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);
    everyoneClaims(table, () => 11);

    const target = table.others()[0];
    roller.send(C2S.CALL, { targetSocketId: target.id, verdict: 'lie' });

    const view = table.view(roller);
    expect(view.phase).toBe('reveal');
    expect(view.dice.faces).toHaveLength(3);
    expect(view.claims.every((claim) => claim.lie !== null)).toBe(true);
  });

  it('lets an Azure card buy the roller a look — and only the roller', () => {
    // Seeds are searched rather than assumed: the deal is random, and a test
    // that hardcoded one would silently stop testing anything the day the
    // shuffle changed.
    for (let seed = 1; seed < 60; seed++) {
      const table = deal(3, seed);
      const roller = table.active();
      const azure = table
        .view(roller)
        .hand.find((card) => card.color === 'azure' && card.rank !== SWAP_RANK);
      if (!azure) continue;

      roller.send(C2S.PLAY, { cardId: azure.id });
      roller.send(C2S.ROLL);

      const view = table.view(roller);
      expect(view.dice.faces).toHaveLength(3);
      expect(view.dice.glimpsed).toBe(true);
      // Buying a look is public knowledge; the number bought is not.
      expect(table.view(roller).log.some((e) => e.kind === 'glimpse')).toBe(true);
      return;
    }
    throw new Error('no seed dealt the first player an Azure card');
  });
});

// ─── Calling ────────────────────────────────────────────────────────────────

describe("Gabriel's Horn — calling a claim", () => {
  it('makes the liar draw when the roller reads them right', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);

    const truth = table.view(table.others()[0]).dice.total as number;
    const liar = table.others()[0];
    const honest = table.others()[1];
    liar.send(C2S.CLAIM, { total: truth === 3 ? 4 : truth - 1 });
    honest.send(C2S.CLAIM, { total: truth });

    const before = handCount(table, liar);
    roller.send(C2S.CALL, { targetSocketId: liar.id, verdict: 'lie' });

    expect(handCount(table, liar)).toBe(before + PENALTY_DRAW);
    expect(handCount(table, roller)).toBe(STARTING_HAND);
    expect(table.view(roller).outcome?.correct).toBe(true);
  });

  it('makes the roller draw when they get it wrong', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);

    const truth = table.view(table.others()[0]).dice.total as number;
    const honest = table.others()[0];
    everyoneClaims(table, () => truth);

    roller.send(C2S.CALL, { targetSocketId: honest.id, verdict: 'lie' });

    expect(handCount(table, roller)).toBe(STARTING_HAND + PENALTY_DRAW);
    expect(handCount(table, honest)).toBe(STARTING_HAND);
  });

  it('costs the roller a draw when the call phase runs out', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);
    everyoneClaims(table, () => 10);

    vi.advanceTimersByTime(PHASE_MS.call + 10);

    expect(handCount(table, roller)).toBe(STARTING_HAND + PENALTY_DRAW);
  });

  it('records silence as the truth when the claim phase runs out', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);
    const truth = table.view(table.others()[0]).dice.total as number;

    vi.advanceTimersByTime(PHASE_MS.claim + 10);

    const view = table.view(roller);
    expect(view.phase).toBe('call');
    expect(view.claims.every((claim) => claim.total === truth)).toBe(true);
  });

  it('refuses a claim from the player who rolled', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);
    roller.send(C2S.CLAIM, { total: 10 });

    expect(roller.last<{ message: string }>(S2C.ERROR)?.message).toBe('roller-cannot-claim');
    expect(table.view(roller).claims.every((claim) => claim.total === null)).toBe(true);
  });

  it('rejects a total the three dice cannot make', () => {
    const table = deal(3);
    table.active().send(C2S.ROLL);
    const speaker = table.others()[0];
    speaker.send(C2S.CLAIM, { total: 19 });

    expect(speaker.last<{ message: string }>(S2C.ERROR)?.message).toBe('invalid-claim');
  });
});

// ─── Cards ──────────────────────────────────────────────────────────────────

describe("Gabriel's Horn — playing cards", () => {
  it('charges a card for every card played', () => {
    const table = deal(3);
    const roller = table.active();
    const card = table.view(roller).hand.find((c) => c.rank !== SWAP_RANK);
    expect(card).toBeTruthy();

    roller.send(C2S.PLAY, { cardId: card?.id });

    // Discard one, draw two: net one worse off, every time.
    expect(handCount(table, roller)).toBe(STARTING_HAND + 1);
  });

  it('trades whole hands on a seven — after the seven has been paid for', () => {
    for (let seed = 1; seed < 80; seed++) {
      const table = deal(3, seed);
      const roller = table.active();
      const seven = table.view(roller).hand.find((c) => c.rank === SWAP_RANK);
      if (!seven) continue;

      const victim = table.others()[0];
      const mine = table.view(roller).hand.filter((c) => c.id !== seven.id);

      roller.send(C2S.PLAY, { cardId: seven.id, targetSocketId: victim.id });

      // They receive the hand as it stood after the discard AND the two draws,
      // which is the whole reason a seven is not a free escape.
      expect(handCount(table, victim)).toBe(STARTING_HAND + 1);
      expect(handCount(table, roller)).toBe(STARTING_HAND);
      const theirs = table.view(victim).hand.map((c) => c.id);
      for (const card of mine) expect(theirs).toContain(card.id);
      expect(theirs).not.toContain(seven.id);
      return;
    }
    throw new Error('no seed dealt the first player a seven');
  });

  it('does not spend the card when the target is invalid', () => {
    for (let seed = 1; seed < 80; seed++) {
      const table = deal(3, seed);
      const roller = table.active();
      const targeted = table
        .view(roller)
        .hand.find((c) => c.rank === SWAP_RANK || c.color === 'crimson' || c.color === 'amber');
      if (!targeted) continue;

      roller.send(C2S.PLAY, { cardId: targeted.id, targetSocketId: roller.id });

      expect(roller.last<{ message: string }>(S2C.ERROR)?.message).toBe('invalid-target');
      expect(handCount(table, roller)).toBe(STARTING_HAND);
      expect(table.view(roller).hand.map((c) => c.id)).toContain(targeted.id);
      return;
    }
    throw new Error('no seed dealt the first player a targeted card');
  });

  it('absorbs a draw with a Verdant ward', () => {
    for (let seed = 1; seed < 80; seed++) {
      const table = deal(2, seed);
      const roller = table.active();
      const ward = table
        .view(roller)
        .hand.find((c) => c.color === 'verdant' && c.rank !== SWAP_RANK);
      if (!ward) continue;

      roller.send(C2S.PLAY, { cardId: ward.id });
      const guarded = handCount(table, roller);
      roller.send(C2S.ROLL);

      const truth = table.view(table.others()[0]).dice.total as number;
      const honest = table.others()[0];
      honest.send(C2S.CLAIM, { total: truth });
      // A wrong call that would normally cost the roller three.
      roller.send(C2S.CALL, { targetSocketId: honest.id, verdict: 'lie' });

      expect(table.view(roller).outcome?.correct).toBe(false);
      expect(table.view(roller).outcome?.drewSocketId).toBeNull();
      expect(handCount(table, roller)).toBe(guarded);
      return;
    }
    throw new Error('no seed dealt the first player a Verdant card');
  });

  it('refuses a card played out of turn', () => {
    const table = deal(3);
    const bystander = table.others()[0];
    const card = table.view(bystander).hand[0];

    bystander.send(C2S.PLAY, { cardId: card.id });

    expect(bystander.last<{ message: string }>(S2C.ERROR)?.message).toBe('not-your-turn');
    expect(handCount(table, bystander)).toBe(STARTING_HAND);
  });

  it('refuses a card once the dice are down', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);
    const card = table.view(roller).hand[0];

    roller.send(C2S.PLAY, { cardId: card.id });

    expect(handCount(table, roller)).toBe(STARTING_HAND);
  });

  it('shows a scried hand to the player who paid for it, and nobody else', () => {
    for (let seed = 1; seed < 80; seed++) {
      const table = deal(3, seed);
      const roller = table.active();
      const amber = table
        .view(roller)
        .hand.find((c) => c.color === 'amber' && c.rank !== SWAP_RANK);
      if (!amber) continue;

      const victim = table.others()[0];
      const theirs = table.view(victim).hand.map((c) => c.id);
      roller.send(C2S.PLAY, { cardId: amber.id, targetSocketId: victim.id });

      expect(table.view(roller).scry?.cards.map((c) => c.id)).toEqual(theirs);
      for (const seat of table.seats) {
        if (seat === roller) continue;
        expect(table.view(seat).scry).toBeNull();
      }
      return;
    }
    throw new Error('no seed dealt the first player an Amber card');
  });
});

// ─── The horn ───────────────────────────────────────────────────────────────

describe("Gabriel's Horn — sounding the End", () => {
  /** Drive one full round, with the roller deliberately calling wrong. */
  function roundWhereRollerPays(table: Table): void {
    const roller = table.active();
    roller.send(C2S.ROLL);
    const truth = table.view(table.others()[0]).dice.total as number;
    const honest = table.others()[0];
    everyoneClaims(table, () => truth);
    roller.send(C2S.CALL, { targetSocketId: honest.id, verdict: 'lie' });
    vi.advanceTimersByTime(PHASE_MS.reveal + 10);
  }

  it('refuses the horn before everyone has had a turn', () => {
    const table = deal(3);
    const first = table.active();
    first.send(C2S.SOUND_END);

    expect(first.last<{ message: string }>(S2C.ERROR)?.message).toBe('too-early');
    expect(table.view(first).endCalledBy).toBeNull();
  });

  it('wins for the caller when they are strictly lowest', () => {
    const table = deal(2);
    // P1 rolls and calls wrong, so P1 is three cards down on P2.
    roundWhereRollerPays(table);
    // P2's turn: they take the same punishment, and now both are level again…
    roundWhereRollerPays(table);
    // …so P1 pays once more, leaving P2 strictly lowest on P2's next turn.
    roundWhereRollerPays(table);

    const caller = table.active();
    const rival = table.others()[0];
    expect(handCount(table, caller)).toBeLessThan(handCount(table, rival));

    caller.send(C2S.SOUND_END);
    // The rival gets their one last turn; passing ends the game.
    rival.send(C2S.PASS);

    const results = caller.last<GameResults>(S2C.RESULTS);
    expect(results).toBeTruthy();
    const winner = results?.standings.find((row) => row.place === 1);
    expect(winner?.socketId).toBe(caller.id);
    expect(winner?.calledEnd).toBe(true);
    expect(winner?.endBackfired).toBe(false);
  });

  it('backfires on a caller who only TIES the field', () => {
    const table = deal(2);
    // Both players have now taken the same punishment once, so the hands are
    // level — which is the sharp edge of the rule: "fewest" is not enough, the
    // caller has to be STRICTLY fewest, and a tie loses.
    roundWhereRollerPays(table);
    roundWhereRollerPays(table);

    const caller = table.active();
    const rival = table.others()[0];
    expect(handCount(table, caller)).toBe(handCount(table, rival));

    caller.send(C2S.SOUND_END);
    rival.send(C2S.PASS);

    const results = caller.last<GameResults>(S2C.RESULTS);
    const callerRow = results?.standings.find((row) => row.socketId === caller.id);
    expect(callerRow?.endBackfired).toBe(true);
    expect(callerRow?.place).toBe(results?.standings.length);
    expect(results?.standings.find((row) => row.place === 1)?.socketId).toBe(rival.id);
  });

  it('gives every other seat exactly one last turn', () => {
    const table = deal(3);
    for (let i = 0; i < 3; i++) roundWhereRollerPays(table);

    const caller = table.active();
    caller.send(C2S.SOUND_END);

    const finalOrder: string[] = [];
    for (let i = 0; i < 2; i++) {
      const view = table.view(caller);
      expect(view.phase).toBe('final');
      const next = table.seats.find((s) => s.id === view.activeSocketId);
      expect(next).toBeTruthy();
      expect(next).not.toBe(caller);
      finalOrder.push(view.activeSocketId);
      next?.send(C2S.PASS);
    }

    expect(new Set(finalOrder).size).toBe(2);
    expect(caller.last<GameResults>(S2C.RESULTS)).toBeTruthy();
  });

  it('treats a missed final turn as a pass', () => {
    const table = deal(2);
    roundWhereRollerPays(table);
    roundWhereRollerPays(table);

    table.active().send(C2S.SOUND_END);
    vi.advanceTimersByTime(PHASE_MS.final + 10);

    expect(table.seats[0].last<GameResults>(S2C.RESULTS)).toBeTruthy();
  });
});

// ─── Leaving ────────────────────────────────────────────────────────────────

describe("Gabriel's Horn — a seat empties", () => {
  // These use the explicit LEAVE, which is the deliberate exit. A dropped
  // SOCKET is a different thing entirely and holds the chair — see the
  // "dropped connection" block below.
  it('ends the game when the table falls below two players', () => {
    const table = deal(2);
    table.seats[1].send(C2S.LEAVE);

    const results = table.seats[0].last<GameResults>(S2C.RESULTS);
    expect(results?.abandoned).toBe(true);
  });

  it('moves the turn along when the player it was waiting on leaves', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);

    roller.send(C2S.LEAVE);

    const survivor = table.seats.find((s) => s !== roller) as FakeSocket;
    const view = table.view(survivor);
    expect(view.activeSocketId).not.toBe(roller.id);
    expect(view.players.some((p) => p.socketId === roller.id)).toBe(false);
    expect(view.phase).toBe('action');
  });

  it('returns a departing hand to the pile rather than losing it', () => {
    const table = deal(3);
    const leaver = table.others()[0];
    const before = table.view(table.seats[0]).deckCount;

    leaver.send(C2S.LEAVE);

    const survivor = table.seats.find((s) => s !== leaver) as FakeSocket;
    // Still 52 cards between the deck, the discard and the remaining hands: the
    // deck is only rebuilt from the discard, so a lost hand would shrink the
    // game permanently.
    const view = table.view(survivor);
    const inHands = view.players.reduce((sum, p) => sum + p.handCount, 0);
    expect(view.deckCount).toBe(before);
    expect(inHands).toBe(STARTING_HAND * 2);
  });
});

// ─── Pauses, drops and returns ──────────────────────────────────────────────

describe("Gabriel's Horn — a dropped connection", () => {
  /** Reconnect as the same account on a fresh socket, as socket.io would. */
  function reconnect(table: Table, gone: FakeSocket, code: string): FakeSocket {
    const socket = new FakeSocket(
      `${gone.id}-r`,
      gone.data.userId as string,
      gone.data.userName as string,
    );
    table.io.sockets.sockets.set(socket.id, socket);
    registerGabrielsHornHandlers(table.io as never, socket as never);
    socket.send(C2S.JOIN, { code });
    return socket;
  }

  it('holds the seat, the hand and the place in turn order', () => {
    const table = deal(3);
    const code = table.view(table.seats[0]).code;
    const dropped = table.others()[0];
    const hand = table.view(dropped).hand.map((c) => c.id);

    handleGabrielsHornDisconnect(table.io as never, dropped as never);

    const stillThere = table
      .view(table.seats[0])
      .players.find((p) => p.userId === dropped.data.userId);
    expect(stillThere?.connected).toBe(false);
    expect(stillThere?.handCount).toBe(STARTING_HAND);

    const back = reconnect(table, dropped, code);
    const view = back.last<GameView>(S2C.STATE) as GameView;
    expect(view.hand.map((c) => c.id)).toEqual(hand);
    expect(view.players.find((p) => p.socketId === back.id)?.connected).toBe(true);
  });

  it('skips an absent seat rather than waiting out its turn', () => {
    const table = deal(3);
    const first = table.active();

    handleGabrielsHornDisconnect(table.io as never, first as never);

    // No timer advanced: the turn moved the instant the socket went.
    const survivor = table.seats.find((s) => s !== first) as FakeSocket;
    const view = table.view(survivor);
    expect(view.activeSocketId).not.toBe(first.id);
    expect(view.phase).toBe('action');
  });

  it('resolves an absent claim as the truth without stalling the phase', () => {
    const table = deal(3);
    const roller = table.active();
    roller.send(C2S.ROLL);
    const [absent, present] = table.others();
    const truth = table.view(present).dice.total as number;

    handleGabrielsHornDisconnect(table.io as never, absent as never);
    present.send(C2S.CLAIM, { total: truth });

    // Both claims are in, so the phase moved on its own — no timer needed.
    expect(table.view(roller).phase).toBe('call');
  });

  it('ends the game when the last connected player drops', () => {
    const table = deal(2);
    const code = table.view(table.seats[0]).code;
    handleGabrielsHornDisconnect(table.io as never, table.seats[0] as never);
    handleGabrielsHornDisconnect(table.io as never, table.seats[1] as never);

    // Nobody is left to receive a frame, so the proof is what a returning
    // player finds: the game ended, released both held chairs, and took the
    // empty table down with it rather than leaving one running on timers.
    const back = reconnect(table, table.seats[0], code);
    expect(back.last<{ message: string }>(S2C.ERROR)?.message).toBe('lobby-not-found');
    expect(back.last<GameView>(S2C.STATE)).toBeUndefined();
  });

  it('gives the seat up once the grace window has passed', () => {
    const table = deal(3);
    const code = table.view(table.seats[0]).code;
    const dropped = table.others()[0];

    handleGabrielsHornDisconnect(table.io as never, dropped as never);
    vi.advanceTimersByTime(RECONNECT_GRACE_MS + 30_000);

    const survivor = table.seats.find((s) => s !== dropped) as FakeSocket;
    expect(table.view(survivor).players.some((p) => p.userId === dropped.data.userId)).toBe(false);

    // And a late return is refused rather than silently seated mid-game.
    const back = reconnect(table, dropped, code);
    expect(back.last<{ message: string }>(S2C.ERROR)?.message).toBe('game-in-progress');
  });

  it('keeps the table moving with nobody touching it', () => {
    // The property the whole clock rests on. Every phase has a timeout with a
    // defined outcome, so a table where all three players walked away from
    // their keyboards still advances round after round instead of stopping on
    // one that nothing will resolve.
    const table = deal(3);
    table.active().send(C2S.ROLL);
    const startRound = table.view(table.seats[0]).round;

    vi.advanceTimersByTime(30 * 60_000);

    expect(table.view(table.seats[0]).round).toBeGreaterThan(startRound);
  });

  it('ends a table that would otherwise play forever', () => {
    // Nobody ever sounds the horn. The turn cap is the backstop, and this walks
    // all the way to it: a game must terminate even when no player ever ends it.
    const table = deal(3);
    vi.advanceTimersByTime(24 * 60 * 60_000);

    const results = table.seats[0].last<GameResults>(S2C.RESULTS);
    expect(results).toBeTruthy();
    expect(results?.endCalledBy).toBeNull();
    expect(results?.standings.length).toBeGreaterThan(0);
  });
});

// ─── Sanity on the rulebook itself ──────────────────────────────────────────

describe("Gabriel's Horn — card effects", () => {
  it('gives every seven the swap, whatever colour it is', () => {
    for (const color of ['azure', 'crimson', 'verdant', 'amber'] as const) {
      expect(effectOf({ id: 'x', color, rank: SWAP_RANK })).toBe('swap');
    }
  });

  it('gives every other rank its colour’s effect', () => {
    expect(effectOf({ id: 'x', color: 'azure', rank: 3 })).toBe('glimpse');
    expect(effectOf({ id: 'x', color: 'crimson', rank: 3 })).toBe('accuse');
    expect(effectOf({ id: 'x', color: 'verdant', rank: 3 })).toBe('ward');
    expect(effectOf({ id: 'x', color: 'amber', rank: 3 })).toBe('scry');
  });
});

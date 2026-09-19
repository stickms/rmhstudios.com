import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The matchmaking queue itself (P2).
 *
 * The band arithmetic is covered in `matchmaking-bands.test.ts`. What is left
 * here is the part that is about a queue being a shared, concurrent, in-memory
 * structure, and every test below is a way one of those goes wrong:
 *
 *   - seating the same person into two rooms because room creation is async
 *   - forgetting how long someone waited when their connection flickers
 *   - dropping a whole search when a game briefly cannot make a room
 *   - leaving a timer running for a queue nobody is in
 */

// `vi.hoisted` because vi.mock factories run before module-scope consts exist.
const partyGames = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../server/socket-server/party-contract', () => ({
  partyGames,
  mintPartyTicket: ({ userId }: { userId: string }) => `ticket:${userId}`,
  PARTY_ROOM_GRACE_MS: 300_000,
}));
vi.mock('../../server/socket-server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  __resetMatchmaking,
  configureMatchmaking,
  isQueueable,
  join,
  leave,
  stateFor,
  statsFor,
} from '../../server/socket-server/matchmaking';

const matched: { userId: string; roomId: string; token: string }[] = [];

/** A game whose room creation resolves after `delayMs`, or rejects. */
function registerGame(id: string, opts: { delayMs?: number; fail?: boolean } = {}) {
  let n = 0;
  partyGames.set(id, {
    maxPartySize: 8,
    createRoomForParty: async () => {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.fail) throw new Error('no room');
      return { game: id, roomId: `room-${++n}` };
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  partyGames.clear();
  matched.length = 0;
  __resetMatchmaking();
  configureMatchmaking({
    pushState: () => {},
    notifyMatch: (member, _game, roomId, token) => {
      matched.push({ userId: member.userId, roomId, token });
    },
  });
});

afterEach(() => {
  __resetMatchmaking();
  vi.useRealTimers();
});

/** Advance past N queue ticks, letting the async room creation settle. */
async function ticks(n = 1) {
  for (let i = 0; i < n; i++) {
    await vi.advanceTimersByTimeAsync(2_000);
  }
}

describe('isQueueable', () => {
  it('is false for a game with no party registration', () => {
    expect(isQueueable('nope')).toBe(false);
  });

  it('is true once the game is registered', () => {
    registerGame('g');
    expect(isQueueable('g')).toBe(true);
  });
});

describe('join and leave', () => {
  it('refuses a game that cannot be queued for', () => {
    expect(join('nope', 'k', [{ userId: 'u' }], 1000, ['s'])).toEqual({
      ok: false,
      reason: 'not-queueable',
    });
  });

  it('reports position and how many are searching', () => {
    registerGame('g');
    join('g', 'a', [{ userId: 'a' }], 1000, ['s1']);
    join('g', 'b', [{ userId: 'b' }, { userId: 'c' }], 1000, ['s2']);

    expect(stateFor('g', 'a')?.position).toBe(0);
    expect(stateFor('g', 'a')?.searching).toBe(3); // party members count individually
  });

  it('keeps the wait already served when a flaky connection rejoins', () => {
    // Resetting joinedAt would mean a bad connection permanently starves you,
    // and the widening bands make that worse the longer it goes on.
    registerGame('g');
    join('g', 'a', [{ userId: 'a' }], 1000, ['s1']);
    const first = stateFor('g', 'a')!;
    vi.advanceTimersByTime(30_000);
    join('g', 'a', [{ userId: 'a' }], 1000, ['s2']);
    expect(stateFor('g', 'a')!.spread).not.toBe(first.spread);
  });

  it('leaves the old queue when the same key joins a different game', () => {
    registerGame('g1');
    registerGame('g2');
    join('g1', 'a', [{ userId: 'a' }], 1000, ['s1']);
    join('g2', 'a', [{ userId: 'a' }], 1000, ['s1']);
    expect(stateFor('g1', 'a')).toBeNull();
    expect(stateFor('g2', 'a')).not.toBeNull();
  });

  it('is idempotent on leave', () => {
    registerGame('g');
    join('g', 'a', [{ userId: 'a' }], 1000, ['s1']);
    leave('a');
    expect(() => leave('a')).not.toThrow();
    expect(stateFor('g', 'a')).toBeNull();
  });
});

describe('forming a match', () => {
  it('seats two compatible players and hands each a ticket', async () => {
    registerGame('g');
    join('g', 'a', [{ userId: 'a' }], 1000, ['s1']);
    join('g', 'b', [{ userId: 'b' }], 1020, ['s2']);

    await ticks(1);

    expect(matched.map((m) => m.userId).sort()).toEqual(['a', 'b']);
    expect(new Set(matched.map((m) => m.roomId)).size).toBe(1);
  });

  it('never seats the same entry twice while a room is being created', async () => {
    // The hazard: room creation is async, so an entry left in the queue during
    // the await is visible to the next tick and gets seated a second time.
    registerGame('g', { delayMs: 5_000 });
    join('g', 'a', [{ userId: 'a' }], 1000, ['s1']);
    join('g', 'b', [{ userId: 'b' }], 1000, ['s2']);

    await ticks(5);

    expect(matched).toHaveLength(2);
    expect(new Set(matched.map((m) => m.roomId)).size).toBe(1);
  });

  it('puts a group back when the game cannot make a room', async () => {
    // A game that briefly cannot seat anybody should cost a couple of seconds,
    // not the whole search.
    registerGame('g', { fail: true });
    join('g', 'a', [{ userId: 'a' }], 1000, ['s1']);
    join('g', 'b', [{ userId: 'b' }], 1000, ['s2']);

    await ticks(1);

    expect(matched).toHaveLength(0);
    expect(stateFor('g', 'a')).not.toBeNull();
    expect(stateFor('g', 'b')).not.toBeNull();
  });

  it('keeps a party together in one room', async () => {
    registerGame('g');
    join('g', 'p', [{ userId: 'x' }, { userId: 'y' }], 1000, ['s1']);
    join('g', 'q', [{ userId: 'z' }, { userId: 'w' }], 1000, ['s2']);

    await ticks(1);

    expect(new Set(matched.map((m) => m.roomId)).size).toBe(1);
    expect(matched).toHaveLength(4);
  });

  it('gives every member exactly one ticket, and their own', async () => {
    // A ticket is a single-use bearer token bound to one user id. An earlier
    // draft fanned out per entry rather than per member, so each member got a
    // copy of the event for every other member — carrying their tickets.
    registerGame('g');
    join('g', 'p', [{ userId: 'x' }, { userId: 'y' }], 1000, ['s1']);
    join('g', 'q', [{ userId: 'z' }, { userId: 'w' }], 1000, ['s2']);

    await ticks(1);

    expect(matched).toHaveLength(4);
    for (const m of matched) expect(m.token).toBe(`ticket:${m.userId}`);
    expect(new Set(matched.map((m) => m.userId)).size).toBe(4);
  });

  it('records the wait so an estimate can eventually be offered', async () => {
    registerGame('g');
    expect(statsFor('g').estimateMs).toBeNull();

    for (let i = 0; i < 5; i++) {
      join('g', `a${i}`, [{ userId: `a${i}` }], 1000, ['s']);
      join('g', `b${i}`, [{ userId: `b${i}` }], 1000, ['s']);
      await ticks(1);
    }

    expect(statsFor('g').estimateMs).not.toBeNull();
  });

  it('reports nothing for a game nobody is queued for', () => {
    expect(statsFor('never-touched')).toEqual({ searching: 0, estimateMs: null });
  });
});

describe('teardown', () => {
  it('stops ticking once the queue empties', async () => {
    registerGame('g');
    join('g', 'a', [{ userId: 'a' }], 1000, ['s1']);
    leave('a');
    await ticks(2);
    // Nothing to assert beyond "did not throw and nobody was matched" — the
    // interval is unref'd and cleared, which a leak check below would catch.
    expect(matched).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

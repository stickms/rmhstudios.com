/* eslint-disable @typescript-eslint/no-explicit-any -- a stateful Prisma fake is untyped by nature. */
/**
 * Tournament seeding (s05-18) through the real start and the real seeding
 * module, against an in-memory Prisma fake: only the host (or an admin) changes
 * the method or the hand order, and only while registration is open; an unknown
 * entrant in the order is a 400 that writes nothing; a start writes seeds 1..n
 * by the stored method for single elimination, double elimination and Swiss (and
 * round robin), a rating seeding splits the top two ratings, a hand order is used
 * exactly, `join` starts exactly as before, and check-in no-shows are dropped
 * before the seeds are given.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => {}) }));

const { startTournament, createTournament, TournamentError } = await import(
  '@/lib/tournaments/tournament.server'
);
const { updateSeeding, projectedSeeds } = await import('@/lib/tournaments/seeding.server');
const { generateBracket } = await import('@/lib/tournaments/bracket');
const { WAGER_ELIGIBLE_GAME_IDS } = await import('@/lib/wager/eligible-games');

interface State {
  tournament: any;
  entrants: any[];
  matches: any[];
  ratings: Map<string, number>;
  locks: string[];
  created: any[];
}
let state: State;
let nextId = 0;

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    const val = row[k];
    if (v === null) return val == null;
    if (typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v && !v.in.includes(val)) return false;
      if ('lte' in v && !(val != null && val.getTime() <= v.lte.getTime())) return false;
      return true;
    }
    return val === v;
  });
}

function apply(row: any, data: any) {
  for (const [k, v] of Object.entries<any>(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) row[k] += v.increment;
    else row[k] = v;
  }
}

function makeDb() {
  const t = () => state.tournament;
  const tx: any = {
    $executeRaw: vi.fn(async (_s: TemplateStringsArray, key: string) => {
      state.locks.push(key);
    }),
    tournament: {
      findUnique: async ({ where }: any) => (where.id === t().id ? { ...t() } : null),
      updateMany: async ({ where, data }: any) => {
        if (!matches(t(), where)) return { count: 0 };
        apply(t(), data);
        return { count: 1 };
      },
      update: async ({ data }: any) => {
        apply(t(), data);
      },
      create: async ({ data }: any) => {
        state.created.push(data);
        return { id: 'new' };
      },
    },
    tournamentEntrant: {
      findMany: async ({ where }: any) =>
        state.entrants.filter((e) => matches(e, where)).map((e) => ({ ...e })),
      update: async ({ where, data }: any) => {
        apply(state.entrants.find((e) => e.id === where.id), data);
      },
      updateMany: async ({ where, data }: any) => {
        const rows = state.entrants.filter((e) => matches(e, where));
        rows.forEach((r) => apply(r, data));
        return { count: rows.length };
      },
      deleteMany: async ({ where }: any) => {
        const before = state.entrants.length;
        state.entrants = state.entrants.filter((e) => !matches(e, where));
        return { count: before - state.entrants.length };
      },
    },
    eloRating: {
      findMany: async ({ where }: any) =>
        where.userId.in
          .filter((u: string) => state.ratings.has(`${where.game}:${u}`))
          .map((u: string) => ({ userId: u, rating: state.ratings.get(`${where.game}:${u}`) })),
    },
    tournamentMatch: {
      createMany: async ({ data }: any) => {
        for (const d of data) state.matches.push({ winnerEntrantId: null, ...d });
      },
      create: async ({ data }: any) => {
        const row = { id: `m${nextId++}`, winnerEntrantId: null, ...data };
        state.matches.push(row);
        return row;
      },
      findMany: async ({ where }: any) => state.matches.filter((m) => matches(m, where)).map((m) => ({ ...m })),
      findUnique: async ({ where }: any) => {
        const m = state.matches.find((x) => x.id === where.id);
        return m ? { ...m } : null;
      },
      update: async ({ where, data }: any) => {
        apply(state.matches.find((m) => m.id === where.id), data);
      },
      updateMany: async ({ where, data }: any) => {
        const rows = state.matches.filter((m) => matches(m, where));
        rows.forEach((r) => apply(r, data));
        return { count: rows.length };
      },
    },
    userProfile: { upsert: async () => {} },
    coinTransaction: { create: async () => {} },
  };
  const db: any = {
    ...tx,
    $transaction: async (fn: (t: any) => Promise<unknown>) => {
      const snap = structuredClone({
        tournament: state.tournament,
        entrants: state.entrants,
        matches: state.matches,
      });
      try {
        return await fn(tx);
      } catch (err) {
        state.tournament = snap.tournament;
        state.entrants = snap.entrants;
        state.matches = snap.matches;
        throw err;
      }
    },
  };
  return db;
}

function seed(n: number, tournament: Record<string, unknown> = {}) {
  nextId = 0;
  state = {
    tournament: {
      id: 't1',
      name: 'Friday Cup',
      gameId: 'void-breaker',
      status: 'REGISTRATION',
      format: 'SINGLE_ELIM',
      entryFeeCoins: 0,
      prizePoolCoins: 0,
      seedPoolCoins: 0,
      minPlayers: 2,
      maxPlayers: 64,
      createdById: 'host',
      startsAt: null,
      checkInMinutes: null,
      seeding: 'join',
      ...tournament,
    },
    entrants: Array.from({ length: n }, (_, i) => ({
      id: `e${i + 1}`,
      tournamentId: 't1',
      userId: `u${i + 1}`,
      joinedAt: new Date(2026, 11, 1, 12, 0, i),
      checkedInAt: null,
      manualSeed: null,
      seed: null,
      wins: 0,
      losses: 0,
    })),
    matches: [],
    ratings: new Map(),
    locks: [],
    created: [],
  };
}

const rate = (user: string, rating: number) => state.ratings.set(`void-breaker:${user}`, rating);
const bySeed = () => [...state.entrants].sort((a, b) => a.seed - b.seed).map((e) => e.id);
const manualSeeds = () => state.entrants.map((e) => e.manualSeed);
const hostOf = (extra: object = {}) => ({ tournamentId: 't1', byUserId: 'host', ...extra });

let db: any;
beforeEach(() => {
  db = makeDb();
});
afterEach(() => vi.restoreAllMocks());

describe('who may change seeding', () => {
  it('the host sets the method and a hand order, under the tournament lock', async () => {
    seed(4);
    await updateSeeding(hostOf({ method: 'manual', order: ['e3', 'e1'] }), db);
    expect(state.tournament.seeding).toBe('manual');
    expect(manualSeeds()).toEqual([2, null, 1, null]);
    expect(state.locks).toEqual(['tournament:t1']);
  });

  it('a new order replaces the old one', async () => {
    seed(4);
    await updateSeeding(hostOf({ order: ['e3', 'e1'] }), db);
    await updateSeeding(hostOf({ order: ['e4'] }), db);
    expect(manualSeeds()).toEqual([null, null, null, 1]);
  });

  it('refuses another member and changes nothing', async () => {
    seed(4);
    await expect(
      updateSeeding({ tournamentId: 't1', byUserId: 'u2', method: 'random', order: ['e1'] }, db),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(state.tournament.seeding).toBe('join');
    expect(manualSeeds()).toEqual([null, null, null, null]);
  });

  it('an admin may', async () => {
    seed(4);
    await updateSeeding({ tournamentId: 't1', byUserId: 'someone', isAdmin: true, method: 'rating' }, db);
    expect(state.tournament.seeding).toBe('rating');
  });

  it('is 404 for an unknown tournament', async () => {
    seed(4);
    await expect(updateSeeding({ tournamentId: 'nope', byUserId: 'host', method: 'rating' }, db)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('once the tournament has left registration', () => {
  it.each(['LIVE', 'COMPLETE', 'CANCELLED'])('refuses a change when %s', async (status) => {
    seed(4, { status, seeding: 'manual' });
    await expect(updateSeeding(hostOf({ method: 'random', order: ['e2', 'e1'] }), db)).rejects.toMatchObject({
      status: 409,
      code: 'STARTED',
    });
    expect(state.tournament.seeding).toBe('manual');
    expect(manualSeeds()).toEqual([null, null, null, null]);
  });

  it('the write is a conditional update: a start that wins the race leaves the order untouched', async () => {
    seed(4);
    const racing = makeDb();
    // The status read still says REGISTRATION, but the start has claimed the row by the time of the write.
    const real = racing.tournament.findUnique;
    racing.tournament.findUnique = async (args: any) => {
      const row = await real(args);
      state.tournament.status = 'LIVE';
      return { ...row, status: 'REGISTRATION' };
    };
    const raced: any = {
      ...racing,
      $transaction: async (fn: any) => fn(racing),
    };
    await expect(updateSeeding(hostOf({ order: ['e2', 'e1'] }), raced)).rejects.toMatchObject({ status: 409 });
    expect(manualSeeds()).toEqual([null, null, null, null]);
  });
});

describe('the hand order', () => {
  it('an entrant id that is not in this tournament is a 400 and writes nothing, not even the method', async () => {
    seed(4);
    await expect(updateSeeding(hostOf({ method: 'manual', order: ['e2', 'someone-else'] }), db)).rejects.toMatchObject({
      status: 400,
      code: 'UNKNOWN_ENTRANT',
    });
    expect(state.tournament.seeding).toBe('join');
    expect(manualSeeds()).toEqual([null, null, null, null]);
  });

  it('a repeated id is a 400', async () => {
    seed(4);
    await expect(updateSeeding(hostOf({ order: ['e2', 'e2'] }), db)).rejects.toBeInstanceOf(TournamentError);
    expect(manualSeeds()).toEqual([null, null, null, null]);
  });
});

describe('creating a tournament', () => {
  it('stores the chosen method, and sign-up order when none is chosen', async () => {
    seed(0);
    const base = { createdById: 'host', name: 'Cup', gameId: 'void-breaker', format: 'SINGLE_ELIM' as const, entryFeeCoins: 0, maxPlayers: 8 };
    await createTournament({ ...base, seeding: 'rating' }, db);
    await createTournament(base, db);
    expect(state.created.map((c) => c.seeding)).toEqual(['rating', 'join']);
  });
});

describe('rating seeding needs a ranked game', () => {
  it('is refused at create and on update for an unranked game (400), and writes nothing', async () => {
    seed(4);
    const base = { createdById: 'host', name: 'Cup', gameId: 'slice-it', format: 'SINGLE_ELIM' as const, entryFeeCoins: 0, maxPlayers: 8 };
    await expect(createTournament({ ...base, seeding: 'rating' }, db)).rejects.toMatchObject({
      code: 'RATING_UNAVAILABLE',
      status: 400,
    });
    expect(state.created).toHaveLength(0);
    state.tournament.gameId = 'slice-it';
    await expect(
      updateSeeding({ tournamentId: 't1', byUserId: 'host', method: 'rating' }, db),
    ).rejects.toMatchObject({ code: 'RATING_UNAVAILABLE', status: 400 });
    await createTournament({ ...base, seeding: 'random' }, db);
  });
});

describe('start: join (old tournaments)', () => {
  it('seeds in sign-up order and builds the same bracket as before seeding existed', async () => {
    seed(8);
    delete state.tournament.seeding; // a row from before the column
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(bySeed()).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8']);
    const expected = generateBracket('SINGLE_ELIM', ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8']).matches.filter(
      (m) => m.round === 1,
    );
    const first = state.matches.filter((m) => m.round === 1).sort((a, b) => a.slot - b.slot);
    expect(first.map((m) => [m.entrantAId, m.entrantBId])).toEqual(
      expected.sort((a, b) => a.slot - b.slot).map((m) => [m.entrantAId, m.entrantBId]),
    );
  });

  it('does not read ratings', async () => {
    seed(4);
    const spy = vi.spyOn(db.eloRating, 'findMany');
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('start: rating', () => {
  it('an 8-player single-elimination bracket puts the top two ratings in opposite halves', async () => {
    seed(8, { seeding: 'rating' });
    [1500, 1100, 1200, 1900, 1000, 1300, 1700, 1400].forEach((r, i) => rate(`u${i + 1}`, r));
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(bySeed()).toEqual(['e4', 'e7', 'e1', 'e8', 'e6', 'e3', 'e2', 'e5']);
    const round1 = state.matches.filter((m) => m.round === 1);
    const half = (id: string) => {
      const m = round1.find((x) => x.entrantAId === id || x.entrantBId === id);
      return m.slot < 2 ? 0 : 1;
    };
    expect(half('e4')).not.toBe(half('e7'));
  });

  it('counts a member without a rating as 1000 and breaks ties by sign-up order', async () => {
    seed(4, { seeding: 'rating' });
    rate('u3', 1000);
    rate('u4', 1200);
    rate('u2', 800);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(bySeed()).toEqual(['e4', 'e1', 'e3', 'e2']);
  });
});

describe('start: manual', () => {
  it('uses a hand order exactly', async () => {
    seed(8, { seeding: 'manual' });
    await updateSeeding(hostOf({ order: ['e5', 'e3', 'e8', 'e1', 'e2', 'e7', 'e4', 'e6'] }), db);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(bySeed()).toEqual(['e5', 'e3', 'e8', 'e1', 'e2', 'e7', 'e4', 'e6']);
  });

  it('appends anyone the host left out, in sign-up order', async () => {
    seed(5, { seeding: 'manual' });
    await updateSeeding(hostOf({ order: ['e4', 'e2'] }), db);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(bySeed()).toEqual(['e4', 'e2', 'e1', 'e3', 'e5']);
  });

  it('a stored hand order is ignored under another method', async () => {
    seed(4, { seeding: 'join' });
    await updateSeeding(hostOf({ order: ['e4', 'e3'] }), db);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(bySeed()).toEqual(['e1', 'e2', 'e3', 'e4']);
  });
});

describe('start: random', () => {
  it('draws from crypto.getRandomValues and records the order as the seeds', async () => {
    seed(8, { seeding: 'random' });
    const draw = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((buf: Uint32Array) => {
      buf[0] = 0;
      return buf;
    }) as any);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(draw).toHaveBeenCalled();
    // Every draw is 0, so each step swaps the current last place with the first.
    expect(bySeed()).toEqual(['e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e1']);
    expect(state.entrants.map((e) => e.seed).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('start: every format', () => {
  it('double elimination builds from the rating order', async () => {
    seed(4, { seeding: 'rating', format: 'DOUBLE_ELIM', minPlayers: 4 });
    [1000, 1400, 1200, 1300].forEach((r, i) => rate(`u${i + 1}`, r));
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(bySeed()).toEqual(['e2', 'e4', 'e3', 'e1']);
    const firstRound = state.matches
      .filter((m) => m.round === 1 && m.bracket === 'W')
      .map((m) => [m.entrantAId, m.entrantBId].sort().join('v'))
      .sort();
    // Seed 1 meets seed 4, seed 2 meets seed 3.
    expect(firstRound).toEqual(['e1ve2', 'e3ve4']);
  });

  it('Swiss writes the rating order as the seeds', async () => {
    seed(6, { seeding: 'rating', format: 'SWISS' });
    [1000, 1500, 1100, 1600, 1200, 1300].forEach((r, i) => rate(`u${i + 1}`, r));
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(bySeed()).toEqual(['e4', 'e2', 'e6', 'e5', 'e3', 'e1']);
    expect(state.tournament.status).toBe('LIVE');
    expect(state.matches.filter((m) => m.round === 1)).toHaveLength(3);
  });

  it('Swiss and round robin honour a hand order', async () => {
    seed(4, { seeding: 'manual', format: 'SWISS' });
    await updateSeeding(hostOf({ order: ['e4', 'e3', 'e2', 'e1'] }), db);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(bySeed()).toEqual(['e4', 'e3', 'e2', 'e1']);

    seed(4, { seeding: 'manual', format: 'ROUND_ROBIN' });
    await updateSeeding(hostOf({ order: ['e2', 'e4'] }), db);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    expect(bySeed()).toEqual(['e2', 'e4', 'e1', 'e3']);
  });
});

describe('start: check-in', () => {
  it('drops no-shows before seeding, so the seeds are 1..n over who is left', async () => {
    const now = new Date('2026-12-01T12:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      seed(6, {
        seeding: 'rating',
        startsAt: new Date(now.getTime() + 10 * 60_000),
        checkInMinutes: 15,
        minPlayers: 2,
      });
      [1900, 1800, 1700, 1600, 1500, 1400].forEach((r, i) => rate(`u${i + 1}`, r));
      for (const id of ['e2', 'e3', 'e4', 'e6']) state.entrants.find((e) => e.id === id).checkedInAt = now;
      // e1 (the best rating) and e5 never checked in: they are dropped, not seeded.
      await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
      expect(state.entrants.map((e) => e.id).sort()).toEqual(['e2', 'e3', 'e4', 'e6']);
      expect(bySeed()).toEqual(['e2', 'e3', 'e4', 'e6']);
      expect(state.entrants.map((e) => e.seed).sort()).toEqual([1, 2, 3, 4]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the pre-start view', () => {
  it('shows ratings and projected seeds for the rating method to anyone', async () => {
    seed(3, { seeding: 'rating' });
    rate('u1', 1100);
    rate('u3', 1500);
    const view = await projectedSeeds({ tournamentId: 't1', viewerId: null }, db);
    expect(view).toEqual({
      method: 'rating',
      canManage: false,
      entrants: [
        { id: 'e3', rating: 1500, projectedSeed: 1 },
        { id: 'e1', rating: 1100, projectedSeed: 2 },
        { id: 'e2', rating: null, projectedSeed: 3 },
      ],
    });
  });

  it('shows a hand order to the host only', async () => {
    seed(3, { seeding: 'manual' });
    await updateSeeding(hostOf({ order: ['e3', 'e2'] }), db);
    const host = await projectedSeeds({ tournamentId: 't1', viewerId: 'host' }, db);
    expect(host?.canManage).toBe(true);
    expect(host?.entrants.map((e) => [e.id, e.projectedSeed])).toEqual([
      ['e3', 1],
      ['e2', 2],
      ['e1', 3],
    ]);
    for (const viewerId of [null, 'u1']) {
      const other = await projectedSeeds({ tournamentId: 't1', viewerId }, db);
      expect(other?.canManage).toBe(false);
      expect(other?.entrants.map((e) => [e.id, e.projectedSeed])).toEqual([
        ['e1', null],
        ['e2', null],
        ['e3', null],
      ]);
    }
  });

  it('does not reveal a random order, and shows the stored seeds after the start', async () => {
    seed(3, { seeding: 'random' });
    const before = await projectedSeeds({ tournamentId: 't1', viewerId: 'host' }, db);
    expect(before?.entrants.every((e) => e.projectedSeed === null)).toBe(true);
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    const after = await projectedSeeds({ tournamentId: 't1', viewerId: null }, db);
    expect(after?.entrants.map((e) => e.projectedSeed)).toEqual([1, 2, 3]);
  });

  it('is null for an unknown tournament', async () => {
    seed(1);
    expect(await projectedSeeds({ tournamentId: 'nope' }, db)).toBeNull();
  });
});

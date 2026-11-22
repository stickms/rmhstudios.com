/* eslint-disable @typescript-eslint/no-explicit-any -- a stateful Prisma fake is untyped by nature. */
/**
 * Tournament check-in (s04-03), against an in-memory Prisma fake that runs the
 * real escrow helpers and the real bracket: the start drops and refunds exactly
 * the entrants who did not check in (once), refuses below `minPlayers` without
 * moving a coin, check-in is refused outside the window, nobody can check you in
 * but the host or an admin, and the notice job claims each tournament once.
 */
import { noticeFallbackText } from '@/lib/notifications/notice-keys';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createNotification = vi.hoisted(() => vi.fn(async (_input: unknown) => {}));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/notifications.server', () => ({ createNotification }));

const { startTournament, registerForTournament, withdrawFromTournament, refundEntrant, TournamentError } =
  await import('@/lib/tournaments/tournament.server');
const { checkIn, hostCheckIn, undoHostCheckIn, updateCheckInSettings, runCheckInNotices } =
  await import('@/lib/tournaments/checkin.server');

const NOW = new Date('2026-12-01T12:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

interface State {
  tournament: any;
  entrants: any[];
  matches: any[];
  coins: Map<string, number>;
  ledger: any[];
  locks: string[];
}
let state: State;

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    const val = row[k];
    if (v === null) return val == null;
    if (v instanceof Date) return val instanceof Date && val.getTime() === v.getTime();
    if (typeof v === 'object') {
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
    else if (v && typeof v === 'object' && !(v instanceof Date) && 'decrement' in v) row[k] -= v.decrement;
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
      findUnique: async ({ where }: any) =>
        where.id === t().id ? { ...t(), _count: { entrants: state.entrants.length } } : null,
      findMany: async ({ where, take }: any) => [t()].filter((x) => matches(x, where)).slice(0, take),
      updateMany: async ({ where, data }: any) => {
        if (!matches(t(), where)) return { count: 0 };
        apply(t(), data);
        return { count: 1 };
      },
      update: async ({ data }: any) => {
        apply(t(), data);
        return t();
      },
    },
    tournamentEntrant: {
      findMany: async ({ where }: any) => state.entrants.filter((e) => matches(e, where)),
      count: async ({ where }: any) => state.entrants.filter((e) => matches(e, where)).length,
      findUnique: async ({ where }: any) =>
        state.entrants.find(
          (e) =>
            e.tournamentId === where.tournamentId_userId.tournamentId && e.userId === where.tournamentId_userId.userId,
        ) ?? null,
      updateMany: async ({ where, data }: any) => {
        const rows = state.entrants.filter((e) => matches(e, where));
        rows.forEach((r) => apply(r, data));
        return { count: rows.length };
      },
      update: async ({ where, data }: any) => {
        apply(
          state.entrants.find((e) => e.id === where.id),
          data,
        );
      },
      deleteMany: async ({ where }: any) => {
        const before = state.entrants.length;
        state.entrants = state.entrants.filter((e) => !matches(e, where));
        return { count: before - state.entrants.length };
      },
      create: async ({ data }: any) => {
        state.entrants.push({ id: `e-${data.userId}`, checkedInAt: null, ...data });
      },
    },
    tournamentMatch: {
      createMany: async ({ data }: any) => {
        state.matches.push(...data);
      },
      findMany: async ({ where }: any) => state.matches.filter((m) => matches(m, where)),
    },
    userProfile: {
      upsert: async ({ where, create, update }: any) => {
        const cur = state.coins.get(where.userId);
        if (cur === undefined) state.coins.set(where.userId, create.coins);
        else if (update.coins) state.coins.set(where.userId, cur + update.coins.increment);
      },
      updateMany: async ({ where, data }: any) => {
        const cur = state.coins.get(where.userId) ?? 0;
        if (cur < where.coins.gte) return { count: 0 };
        state.coins.set(where.userId, cur - data.coins.decrement);
        return { count: 1 };
      },
    },
    coinTransaction: {
      create: async ({ data }: any) => {
        if (data.idempotencyKey && state.ledger.some((l) => l.idempotencyKey === data.idempotencyKey)) {
          throw new Error('Unique constraint failed on idempotencyKey');
        }
        state.ledger.push(data);
      },
    },
  };
  const db: any = {
    ...tx,
    $transaction: async (fn: (t: any) => Promise<unknown>) => {
      const snap = structuredClone({
        tournament: state.tournament,
        entrants: state.entrants,
        matches: state.matches,
        coins: [...state.coins],
        ledger: state.ledger,
      });
      try {
        return await fn(tx);
      } catch (err) {
        state.tournament = snap.tournament;
        state.entrants = snap.entrants;
        state.matches = snap.matches;
        state.coins = new Map(snap.coins);
        state.ledger = snap.ledger;
        throw err;
      }
    },
  };
  return db;
}

function seed(opts: { users: string[]; checkedIn: string[]; tournament?: Record<string, unknown> }) {
  state = {
    tournament: {
      id: 't1',
      name: 'Friday Cup',
      status: 'REGISTRATION',
      format: 'SINGLE_ELIM',
      entryFeeCoins: 50,
      prizePoolCoins: 50 * opts.users.length,
      seedPoolCoins: 0,
      minPlayers: 2,
      maxPlayers: 8,
      createdById: 'host',
      startsAt: minutes(10),
      checkInMinutes: 15,
      checkInNoticeAt: null,
      ...opts.tournament,
    },
    entrants: opts.users.map((u, i) => ({
      id: `e-${u}`,
      tournamentId: 't1',
      userId: u,
      joinedAt: minutes(-100 + i),
      checkedInAt: opts.checkedIn.includes(u) ? minutes(-1) : null,
    })),
    matches: [],
    coins: new Map(),
    ledger: [],
    locks: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  createNotification.mockClear();
});
afterEach(() => vi.useRealTimers());

function coinsFor(userId: string, n: number) {
  state.coins.set(userId, n);
}

describe('start drops and refunds the unchecked', () => {
  const six = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];

  it('removes exactly the two who did not check in, refunds 50 each once, and draws the bracket from the rest', async () => {
    seed({ users: six, checkedIn: ['u1', 'u2', 'u3', 'u4'] });
    const db = makeDb();
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);

    expect(state.tournament.status).toBe('LIVE');
    expect(state.entrants.map((e) => e.userId)).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(state.tournament.prizePoolCoins).toBe(200);
    expect(state.matches).toHaveLength(3);
    const seeded = new Set(state.matches.flatMap((m) => [m.entrantAId, m.entrantBId]).filter(Boolean));
    expect([...seeded].sort()).toEqual(['e-u1', 'e-u2', 'e-u3', 'e-u4']);

    expect(state.ledger).toHaveLength(2);
    expect(state.ledger.map((l) => l.idempotencyKey).sort()).toEqual([
      'tournament:entrant:e-u5:no-show',
      'tournament:entrant:e-u6:no-show',
    ]);
    for (const l of state.ledger) {
      expect(l).toMatchObject({ amount: 50, note: 'Tournament no-show refund', type: 'WAGER' });
    }
    expect(state.coins.get('u5')).toBe(60); // fresh profile (10) + 50
    expect(state.coins.get('u6')).toBe(60);
    expect(state.coins.has('u1')).toBe(false);

    const notified = createNotification.mock.calls.map((c: any) => c[0]);
    expect(notified.map((n: any) => n.userId).sort()).toEqual(['u5', 'u6']);
    expect(notified[0]).toMatchObject({ entityType: 'tournament_checkin', entityId: 't1' });
    expect(noticeFallbackText(notified[0].preview)).toBe(
      'You were removed from Friday Cup because you did not check in',
    );
  });

  it('refunds once when the start is run twice', async () => {
    seed({ users: six, checkedIn: ['u1', 'u2', 'u3', 'u4'] });
    const db = makeDb();
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, db);
    await expect(startTournament({ tournamentId: 't1', byUserId: 'host' }, db)).rejects.toMatchObject({
      code: 'STARTED',
    });
    expect(state.ledger).toHaveLength(2);
    expect(state.coins.get('u5')).toBe(60);
    expect(state.tournament.prizePoolCoins).toBe(200);
  });

  it('refundEntrant refunds an entrant once whatever calls it', async () => {
    seed({ users: ['u1', 'u2'], checkedIn: [] });
    const db = makeDb();
    await db.$transaction(async (tx: any) => {
      const t = { id: 't1', entryFeeCoins: 50 };
      const e = { id: 'e-u1', userId: 'u1' };
      expect(await refundEntrant(tx, t, e, 'no-show')).toBe(true);
      expect(await refundEntrant(tx, t, e, 'no-show')).toBe(false);
    });
    expect(state.ledger).toHaveLength(1);
    expect(state.coins.get('u1')).toBe(60);
    expect(state.tournament.prizePoolCoins).toBe(50);
  });

  it('a withdrawal still refunds under its own note and key (behaviour unchanged by the extraction)', async () => {
    seed({ users: ['u1', 'u2'], checkedIn: [] });
    await withdrawFromTournament({ tournamentId: 't1', userId: 'u1' }, makeDb());
    expect(state.entrants.map((e) => e.userId)).toEqual(['u2']);
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0]).toMatchObject({
      recipientId: 'u1',
      amount: 50,
      note: 'Tournament withdrawal refund',
      idempotencyKey: 'tournament:entrant:e-u1:withdraw',
    });
    expect(state.tournament.prizePoolCoins).toBe(50);
  });

  it('refuses below minPlayers with the numbers and moves nothing', async () => {
    seed({ users: six, checkedIn: ['u1', 'u2', 'u3'], tournament: { minPlayers: 4 } });
    const db = makeDb();
    const err: any = await startTournament({ tournamentId: 't1', byUserId: 'host' }, db).catch((e) => e);
    expect(err).toBeInstanceOf(TournamentError);
    expect(err).toMatchObject({
      code: 'TOO_FEW_CHECKED_IN',
      status: 400,
      details: { checkedIn: 3, needed: 4 },
    });
    expect(err.message).toBe('Only 3 of the 4 players needed have checked in');
    expect(state.tournament.status).toBe('REGISTRATION');
    expect(state.tournament.startedAt).toBeUndefined();
    expect(state.entrants).toHaveLength(6);
    expect(state.ledger).toHaveLength(0);
    expect(state.coins.size).toBe(0);
    expect(state.tournament.prizePoolCoins).toBe(300);
    expect(state.matches).toHaveLength(0);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('keeps everyone when the window has not opened yet', async () => {
    seed({ users: ['u1', 'u2', 'u3', 'u4'], checkedIn: [], tournament: { startsAt: minutes(120) } });
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, makeDb());
    expect(state.entrants).toHaveLength(4);
    expect(state.ledger).toHaveLength(0);
  });

  it('keeps everyone when the tournament has no check-in', async () => {
    seed({ users: ['u1', 'u2', 'u3', 'u4'], checkedIn: [], tournament: { checkInMinutes: null } });
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, makeDb());
    expect(state.entrants).toHaveLength(4);
    expect(state.ledger).toHaveLength(0);
  });

  it('takes the per-tournament advisory lock before claiming', async () => {
    seed({ users: ['u1', 'u2'], checkedIn: ['u1', 'u2'] });
    await startTournament({ tournamentId: 't1', byUserId: 'host' }, makeDb());
    expect(state.locks).toEqual(['tournament:t1']);
  });
});

describe('self check-in', () => {
  it('marks the caller inside the window and is a no-op the second time', async () => {
    seed({ users: ['u1', 'u2'], checkedIn: [] });
    const db = makeDb();
    await checkIn({ tournamentId: 't1', userId: 'u1' }, db, NOW);
    expect(state.entrants[0].checkedInAt).toEqual(NOW);
    expect(state.entrants[1].checkedInAt).toBeNull();
    await checkIn({ tournamentId: 't1', userId: 'u1' }, db, minutes(3));
    expect(state.entrants[0].checkedInAt).toEqual(NOW);
    expect(state.locks).toEqual(['tournament:t1', 'tournament:t1']);
  });

  it('is refused before the window opens', async () => {
    seed({ users: ['u1'], checkedIn: [], tournament: { startsAt: minutes(60) } });
    await expect(checkIn({ tournamentId: 't1', userId: 'u1' }, makeDb(), NOW)).rejects.toMatchObject({
      code: 'NOT_OPEN',
      status: 409,
    });
    expect(state.entrants[0].checkedInAt).toBeNull();
  });

  it('is refused when the tournament has no check-in, has started, or the caller is not entered', async () => {
    seed({ users: ['u1'], checkedIn: [], tournament: { checkInMinutes: null } });
    await expect(checkIn({ tournamentId: 't1', userId: 'u1' }, makeDb(), NOW)).rejects.toMatchObject({
      code: 'NO_CHECKIN',
    });
    seed({ users: ['u1'], checkedIn: [], tournament: { status: 'LIVE' } });
    await expect(checkIn({ tournamentId: 't1', userId: 'u1' }, makeDb(), NOW)).rejects.toMatchObject({
      code: 'CLOSED',
    });
    seed({ users: ['u1'], checkedIn: [] });
    await expect(checkIn({ tournamentId: 't1', userId: 'stranger' }, makeDb(), NOW)).rejects.toMatchObject({
      code: 'NOT_ENTERED',
      status: 404,
    });
  });
});

describe('host check-in', () => {
  it('another member cannot check you in or undo it; the host and an admin can', async () => {
    seed({ users: ['u1', 'u2'], checkedIn: [] });
    const db = makeDb();
    await expect(hostCheckIn({ tournamentId: 't1', byUserId: 'u2', userId: 'u1' }, db, NOW)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
    expect(state.entrants[0].checkedInAt).toBeNull();

    await hostCheckIn({ tournamentId: 't1', byUserId: 'host', userId: 'u1' }, db, NOW);
    expect(state.entrants[0].checkedInAt).toEqual(NOW);
    await expect(undoHostCheckIn({ tournamentId: 't1', byUserId: 'u2', userId: 'u1' }, db)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(state.entrants[0].checkedInAt).toEqual(NOW);

    await undoHostCheckIn({ tournamentId: 't1', byUserId: 'host', userId: 'u1' }, db);
    expect(state.entrants[0].checkedInAt).toBeNull();
    await hostCheckIn({ tournamentId: 't1', byUserId: 'admin', isAdmin: true, userId: 'u2' }, db, NOW);
    expect(state.entrants[1].checkedInAt).toEqual(NOW);
  });

  it('refuses a user who is not an entrant, and anything after the start', async () => {
    seed({ users: ['u1'], checkedIn: [] });
    await expect(
      hostCheckIn({ tournamentId: 't1', byUserId: 'host', userId: 'nobody' }, makeDb(), NOW),
    ).rejects.toMatchObject({ code: 'NOT_ENTERED' });
    seed({ users: ['u1'], checkedIn: [], tournament: { status: 'LIVE' } });
    await expect(
      hostCheckIn({ tournamentId: 't1', byUserId: 'host', userId: 'u1' }, makeDb(), NOW),
    ).rejects.toMatchObject({ code: 'CLOSED' });
  });
});

describe('registering during the window', () => {
  it('counts as checking in; registering before it does not', async () => {
    seed({ users: [], checkedIn: [] });
    coinsFor('late', 100);
    await registerForTournament({ tournamentId: 't1', userId: 'late' }, makeDb());
    expect(state.entrants[0].checkedInAt).toEqual(NOW);

    seed({ users: [], checkedIn: [], tournament: { startsAt: minutes(120) } });
    coinsFor('early', 100);
    await registerForTournament({ tournamentId: 't1', userId: 'early' }, makeDb());
    expect(state.entrants[0].checkedInAt).toBeNull();
  });
});

describe('check-in settings', () => {
  it('needs a start time, the host, and a legal window', async () => {
    seed({ users: ['u1'], checkedIn: [], tournament: { startsAt: null, checkInMinutes: null } });
    const db = makeDb();
    await expect(
      updateCheckInSettings({ tournamentId: 't1', byUserId: 'host', checkInMinutes: 30 }, db, NOW),
    ).rejects.toMatchObject({ code: 'NO_START_TIME' });
    seed({ users: ['u1'], checkedIn: [] });
    await expect(
      updateCheckInSettings({ tournamentId: 't1', byUserId: 'u1', checkInMinutes: 30 }, makeDb(), NOW),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      updateCheckInSettings({ tournamentId: 't1', byUserId: 'host', checkInMinutes: 20 }, makeDb(), NOW),
    ).rejects.toMatchObject({ code: 'BAD_WINDOW' });
    expect(state.tournament.checkInMinutes).toBe(15);
  });

  it('turning it off clears the marks; a window still ahead re-arms the notice, one already open keeps it', async () => {
    seed({ users: ['u1'], checkedIn: ['u1'], tournament: { checkInNoticeAt: minutes(-1) } });
    const db = makeDb();
    await updateCheckInSettings({ tournamentId: 't1', byUserId: 'host', checkInMinutes: 30 }, db, NOW);
    expect(state.tournament.checkInMinutes).toBe(30);
    expect(state.tournament.checkInNoticeAt).toEqual(minutes(-1)); // starts in 10 min: window open

    state.tournament.startsAt = minutes(120);
    await updateCheckInSettings({ tournamentId: 't1', byUserId: 'host', checkInMinutes: 10 }, db, NOW);
    expect(state.tournament.checkInNoticeAt).toBeNull();

    await updateCheckInSettings({ tournamentId: 't1', byUserId: 'host', checkInMinutes: null }, db, NOW);
    expect(state.tournament.checkInMinutes).toBeNull();
    expect(state.entrants[0].checkedInAt).toBeNull();
  });
});

describe('the check-in-open notice job', () => {
  it('claims each due tournament once and notifies each entrant once', async () => {
    seed({ users: ['u1', 'u2', 'u3'], checkedIn: [] });
    const db = makeDb();
    expect(await runCheckInNotices(db, NOW)).toBe(1);
    expect(state.tournament.checkInNoticeAt).toEqual(NOW);
    expect(createNotification).toHaveBeenCalledTimes(3);
    expect(createNotification.mock.calls[0]?.[0]).toMatchObject({
      type: 'SYSTEM',
      entityType: 'tournament_checkin',
      entityId: 't1',
      preview: expect.objectContaining({ fallback: 'Check-in is open for Friday Cup' }),
      link: '/tournaments/t1',
    });
    expect(await runCheckInNotices(db, minutes(1))).toBe(0);
    expect(createNotification).toHaveBeenCalledTimes(3);
  });

  it('skips a tournament whose window is not open, one without check-in, and one already started', async () => {
    const db = () => makeDb();
    seed({ users: ['u1'], checkedIn: [], tournament: { startsAt: minutes(16) } });
    expect(await runCheckInNotices(db(), NOW)).toBe(0);
    expect(await runCheckInNotices(db(), minutes(1))).toBe(1);
    seed({ users: ['u1'], checkedIn: [], tournament: { checkInMinutes: null } });
    expect(await runCheckInNotices(db(), NOW)).toBe(0);
    seed({ users: ['u1'], checkedIn: [], tournament: { status: 'LIVE' } });
    expect(await runCheckInNotices(db(), NOW)).toBe(0);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('claims at most `limit` per run', async () => {
    seed({ users: ['u1'], checkedIn: [] });
    expect(await runCheckInNotices(makeDb(), NOW, 0)).toBe(0);
    expect(state.tournament.checkInNoticeAt).toBeNull();
  });
});

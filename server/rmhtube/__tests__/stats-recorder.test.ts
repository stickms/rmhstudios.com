import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../prisma-client', () => ({
  getPrismaClient: () => {
    throw new Error('the recorder tests inject their own database');
  },
}));

import { StatsRecorder, type RecorderRoom } from '../stats-recorder';

/** A tiny in-memory stand-in for the four Prisma models the recorder touches. Operations are lazy thunks the
 * transaction runs, so a failed transaction applies nothing, as in Postgres. */
function fakeDb() {
  const users = new Map<
    string,
    {
      id: string;
      banReason: string | null;
      deletionScheduledAt: Date | null;
    }
  >();
  const stats = new Map<string, Record<string, unknown>>();
  const days = new Map<string, number>();
  const state = {
    failTransactions: false,
    transactions: 0,
    cleanups: [] as unknown[],
  };
  type Thunk = () => unknown;
  const db = {
    user: {
      findMany: async ({
        where,
      }: {
        where: {
          id: {
            in: string[];
          };
        };
      }) => where.id.in.map((id) => users.get(id)).filter(Boolean),
    },
    rmhTubeUserStats: {
      findUnique: async ({
        where,
      }: {
        where: {
          userId: string;
        };
      }) => stats.get(where.userId) ?? null,
      findMany: async ({
        where,
      }: {
        where: {
          userId: {
            in: string[];
          };
        };
      }) => where.userId.in.map((id) => stats.get(id)).filter(Boolean),
      upsert:
        ({
          where,
          create,
          update,
        }: {
          where: {
            userId: string;
          };
          create: Record<string, unknown>;
          update: Record<
            string,
            {
              increment: number;
            }
          >;
        }): Thunk =>
        () => {
          const row = stats.get(where.userId);
          if (!row) {
            stats.set(where.userId, {
              paused: false,
              clearedAt: null,
              ...create,
            });
            return;
          }
          for (const [k, v] of Object.entries(update)) row[k] = (row[k] as number) + v.increment;
        },
    },
    rmhTubeWatchDay: {
      upsert:
        ({
          where,
          create,
          update,
        }: {
          where: {
            userId_day: {
              userId: string;
              day: string;
            };
          };
          create: {
            minutes: number;
          };
          update: {
            minutes: {
              increment: number;
            };
          };
        }): Thunk =>
        () => {
          const key = `${where.userId_day.userId}|${where.userId_day.day}`;
          days.set(key, days.has(key) ? days.get(key)! + update.minutes.increment : create.minutes);
        },
      deleteMany:
        (args: unknown): Thunk =>
        () => {
          state.cleanups.push(args);
        },
    },
    $transaction: async (ops: Thunk[]) => {
      state.transactions += 1;
      if (state.failTransactions) throw new Error('db down');
      for (const op of ops) op();
    },
  };
  return {
    db,
    users,
    stats,
    days,
    state,
  };
}

const T0 = Date.UTC(2026, 10, 28, 12, 0, 0);

function setup() {
  const f = fakeDb();
  let now = T0;
  const log = {
    error: vi.fn(),
  };
  const recorder = new StatsRecorder({
    getDb: () => f.db as never,
    now: () => now,
    log,
  });
  const advance = (ms: number) => {
    now += ms;
  };
  const addUser = (
    id: string,
    extra: Partial<{
      banReason: string | null;
      deletionScheduledAt: Date | null;
    }> = {},
  ) =>
    f.users.set(id, {
      id,
      banReason: null,
      deletionScheduledAt: null,
      ...extra,
    });
  return {
    ...f,
    recorder,
    advance,
    log,
    addUser,
  };
}

function room(
  over: Partial<{
    id: string;
    playing: boolean;
    stalled: boolean;
    duration: number | null;
    members: {
      userId: string;
      isConnected: boolean;
    }[];
    item: boolean;
  }> = {},
): RecorderRoom {
  return {
    id: over.id ?? 'ROOM01',
    videoState: {
      playing: over.playing ?? true,
      stalled: over.stalled ?? false,
    },
    currentItem:
      over.item === false
        ? null
        : {
            id: 'item-1',
            duration: over.duration === undefined ? 240 : over.duration,
          },
    members: over.members ?? [
      {
        userId: 'u1',
        isConnected: true,
      },
    ],
  };
}

/** Run the sampler for `seconds` of room time in 5 s ticks (the first call primes the clock). */
function play(s: ReturnType<typeof setup>, rooms: RecorderRoom[], seconds: number) {
  for (let i = 0; i < seconds / 5; i += 1) {
    s.advance(5_000);
    s.recorder.sample(rooms);
  }
}

async function known(s: ReturnType<typeof setup>, ...ids: string[]) {
  // A member's pause flag is read on join; do the same so the sampler may count them.
  for (const id of ids) s.recorder.memberJoined('ROOM01', id);
  await new Promise((r) => setTimeout(r, 0));
}

let s: ReturnType<typeof setup>;
beforeEach(async () => {
  s = setup();
  s.addUser('u1');
  s.recorder.sample([]); // prime the sampler clock
});

describe('watched minutes', () => {
  it('counts whole minutes only while the room is playing and the member is present', async () => {
    await known(s, 'u1');
    play(
      s,
      [
        room({
          playing: false,
        }),
      ],
      120,
    );
    play(
      s,
      [
        room({
          members: [
            {
              userId: 'u1',
              isConnected: false,
            },
          ],
        }),
      ],
      120,
    );
    play(
      s,
      [
        room({
          stalled: true,
        }),
      ],
      120,
    );
    play(
      s,
      [
        room({
          item: false,
        }),
      ],
      120,
    );
    await s.recorder.flush();
    expect(s.stats.get('u1')?.totalWatchTimeMinutes ?? 0).toBe(0);

    play(s, [room()], 125);
    await s.recorder.flush();
    expect(s.stats.get('u1')?.totalWatchTimeMinutes).toBe(2);
    expect([...s.days.values()]).toEqual([2]);
  });

  it('credits one member in two rooms once per sample (two tabs are one person)', async () => {
    await known(s, 'u1');
    play(s, [room(), { ...room(), id: 'ROOM02' }], 120);
    await s.recorder.flush();
    expect(s.stats.get('u1')?.totalWatchTimeMinutes).toBe(2);
  });

  it('bounds the held deltas when the database is down', async () => {
    const rec = s.recorder as unknown as { deltas: Map<string, unknown>; bump(u: string, k: string): void };
    for (let i = 0; i < 5_100; i += 1) rec.bump(`user-${i}`, 'messagesSent');
    expect(rec.deltas.size).toBeLessThanOrEqual(5_000);
  });

  it('carries the sub-minute remainder to the next flush instead of rounding up', async () => {
    await known(s, 'u1');
    play(s, [room()], 50);
    await s.recorder.flush();
    expect(s.stats.get('u1')?.totalWatchTimeMinutes ?? 0).toBe(0);
    play(s, [room()], 10);
    await s.recorder.flush();
    expect(s.stats.get('u1')?.totalWatchTimeMinutes).toBe(1);
  });

  it('never credits more than one sample window after a stalled event loop', async () => {
    await known(s, 'u1');
    s.advance(10 * 60_000);
    s.recorder.sample([room()]);
    await s.recorder.flush();
    expect(s.stats.get('u1')?.totalWatchTimeMinutes ?? 0).toBe(0);
  });
});

describe('videos watched', () => {
  it('counts an item once the member was present for half of its known duration, and only once', async () => {
    await known(s, 'u1');
    const rooms = [
      room({
        duration: 240,
      }),
    ];
    play(s, rooms, 115);
    await s.recorder.flush();
    expect(s.stats.get('u1')?.videosWatched ?? 0).toBe(0);
    play(s, rooms, 10);
    play(s, rooms, 300);
    await s.recorder.flush();
    expect(s.stats.get('u1')?.videosWatched).toBe(1);
  });

  it('uses two minutes when the duration is unknown', async () => {
    await known(s, 'u1');
    const rooms = [
      room({
        duration: null,
      }),
    ];
    play(s, rooms, 115);
    await s.recorder.flush();
    expect(s.stats.get('u1')?.videosWatched ?? 0).toBe(0);
    play(s, rooms, 10);
    await s.recorder.flush();
    expect(s.stats.get('u1')?.videosWatched).toBe(1);
  });

  it('counts the same item again in a new room session', async () => {
    await known(s, 'u1');
    play(
      s,
      [
        room({
          duration: 60,
        }),
      ],
      60,
    );
    s.recorder.roomClosed('ROOM01');
    await s.recorder.flush();
    play(
      s,
      [
        room({
          duration: 60,
        }),
      ],
      60,
    );
    await s.recorder.flush();
    expect(s.stats.get('u1')?.videosWatched).toBe(2);
  });
});

describe('event counters', () => {
  it('counts rooms created, messages and reactions, and a room joined once per UTC day', async () => {
    s.recorder.roomCreated('u1');
    s.recorder.memberJoined('R1', 'u1');
    await new Promise((r) => setTimeout(r, 0));
    s.recorder.memberJoined('R1', 'u1');
    s.recorder.memberJoined('R2', 'u1');
    await new Promise((r) => setTimeout(r, 0));
    s.recorder.messageSent('u1');
    s.recorder.messageSent('u1');
    s.recorder.reactionUsed('u1');
    await s.recorder.flush();
    expect(s.stats.get('u1')).toMatchObject({
      roomsCreated: 1,
      roomsJoined: 2,
      messagesSent: 2,
      reactionsUsed: 1,
    });

    s.advance(24 * 60 * 60_000);
    s.recorder.memberJoined('R1', 'u1');
    await new Promise((r) => setTimeout(r, 0));
    await s.recorder.flush();
    expect(s.stats.get('u1')?.roomsJoined).toBe(3);
  });
});

describe('flush', () => {
  it('increments, clears what it wrote, and does not write twice', async () => {
    await known(s, 'u1');
    s.recorder.messageSent('u1');
    await s.recorder.flush();
    const writes = s.state.transactions;
    await s.recorder.flush();
    expect(s.state.transactions).toBe(writes);
    expect(s.stats.get('u1')?.messagesSent).toBe(1);
  });

  it('keeps the delta when the write fails and carries it on the next flush without double counting', async () => {
    await known(s, 'u1');
    s.recorder.messageSent('u1');
    play(s, [room()], 60);
    s.state.failTransactions = true;
    await s.recorder.flush();
    expect(s.log.error).toHaveBeenCalled();
    expect(s.stats.get('u1')?.messagesSent ?? 0).toBe(0);
    s.state.failTransactions = false;
    await s.recorder.flush();
    await s.recorder.flush();
    expect(s.stats.get('u1')).toMatchObject({
      messagesSent: 1,
      totalWatchTimeMinutes: 1,
    });
  });

  it('keeps what accrued while a write was in flight', async () => {
    await known(s, 'u1');
    s.recorder.messageSent('u1');
    const original = s.db.$transaction;
    s.db.$transaction = async (ops) => {
      s.recorder.messageSent('u1'); // accrues mid-write
      await original(ops);
    };
    await s.recorder.flush();
    s.db.$transaction = original;
    await s.recorder.flush();
    expect(s.stats.get('u1')?.messagesSent).toBe(2);
  });

  it('shares one flush between concurrent callers', async () => {
    await known(s, 'u1');
    s.recorder.messageSent('u1');
    await Promise.all([s.recorder.flush(), s.recorder.flush(), s.recorder.flush()]);
    expect(s.state.transactions).toBe(1);
    expect(s.stats.get('u1')?.messagesSent).toBe(1);
  });

  it('runs the 90-day cleanup at most once a day per member', async () => {
    await known(s, 'u1');
    s.recorder.messageSent('u1');
    await s.recorder.flush();
    s.recorder.messageSent('u1');
    await s.recorder.flush();
    expect(s.state.cleanups).toHaveLength(1);
    expect(s.state.cleanups[0]).toEqual({
      where: {
        userId: 'u1',
        day: {
          lt: '2026-08-31',
        },
      },
    });
    s.advance(24 * 60 * 60_000);
    s.recorder.messageSent('u1');
    await s.recorder.flush();
    expect(s.state.cleanups).toHaveLength(2);
  });
});

describe('who is never counted', () => {
  it('skips a paused member at join, and counts nothing for them', async () => {
    s.stats.set('u1', {
      userId: 'u1',
      paused: true,
      clearedAt: null,
      messagesSent: 0,
      totalWatchTimeMinutes: 0,
    });
    await known(s, 'u1');
    s.recorder.messageSent('u1');
    play(s, [room()], 120);
    await s.recorder.flush();
    expect(s.stats.get('u1')).toMatchObject({
      messagesSent: 0,
      totalWatchTimeMinutes: 0,
    });
  });

  it('drops a delta held for a member who paused afterwards', async () => {
    await known(s, 'u1');
    s.recorder.messageSent('u1');
    s.stats.set('u1', {
      userId: 'u1',
      paused: true,
      clearedAt: null,
      messagesSent: 0,
    });
    await s.recorder.flush();
    expect(s.stats.get('u1')?.messagesSent).toBe(0);
    s.stats.set('u1', {
      userId: 'u1',
      paused: false,
      clearedAt: null,
      messagesSent: 0,
    });
    await s.recorder.flush();
    expect(s.stats.get('u1')?.messagesSent).toBe(0);
  });

  it('never counts a member whose pause flag is not yet known', () => {
    play(
      s,
      [
        room({
          members: [
            {
              userId: 'stranger',
              isConnected: true,
            },
          ],
        }),
      ],
      120,
    );
    return s.recorder.flush().then(() => expect(s.stats.has('stranger')).toBe(false));
  });

  it('never writes a member who requested deletion or was anonymised', async () => {
    s.addUser('gone', {
      deletionScheduledAt: new Date(T0 + 1000),
    });
    s.addUser('tomb', {
      banReason: 'account_deleted',
    });
    for (const id of ['gone', 'tomb']) {
      s.recorder.memberJoined('R', id);
    }
    await new Promise((r) => setTimeout(r, 0));
    s.recorder.messageSent('gone');
    s.recorder.messageSent('tomb');
    s.recorder.messageSent('u1');
    await s.recorder.flush();
    expect(s.stats.has('gone')).toBe(false);
    expect(s.stats.has('tomb')).toBe(false);
  });

  it('never writes a member who has no user row at all', async () => {
    s.recorder.memberJoined('R', 'ghost');
    await new Promise((r) => setTimeout(r, 0));
    s.recorder.messageSent('ghost');
    await s.recorder.flush();
    expect(s.stats.has('ghost')).toBe(false);
  });

  it('drops a delta that began before the member cleared their statistics', async () => {
    await known(s, 'u1');
    s.recorder.messageSent('u1');
    s.advance(1_000);
    s.stats.set('u1', {
      userId: 'u1',
      paused: false,
      clearedAt: new Date(T0 + 500),
      messagesSent: 0,
    });
    await s.recorder.flush();
    expect(s.stats.get('u1')?.messagesSent).toBe(0);
    // Counting resumes after the clear.
    s.advance(1_000);
    s.recorder.messageSent('u1');
    await s.recorder.flush();
    expect(s.stats.get('u1')?.messagesSent).toBe(1);
  });
});

describe('hub wiring', () => {
  it('calls the recorder from the hub handlers (source scan)', async () => {
    const { readFileSync } = await import('node:fs');
    const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    expect(read('room-manager.ts')).toMatch(/statsRecorder\s*\.roomCreated/);
    expect(read('room-manager.ts')).toMatch(/statsRecorder\s*\.memberJoined/);
    expect(read('room-manager.ts')).toMatch(/statsRecorder\s*\.roomClosed/);
    expect(read('chat-handler.ts')).toMatch(/statsRecorder\s*\.messageSent/);
    expect(read('chat-handler.ts')).toMatch(/statsRecorder\s*\.reactionUsed/);
    expect(read('party-handler.ts')).toMatch(/statsRecorder\s*\.reactionUsed/);
    expect(read('index.ts')).toMatch(/statsRecorder\s*\.start/);
    expect(read('index.ts')).toMatch(/statsRecorder\s*\.stop/);
  });
});

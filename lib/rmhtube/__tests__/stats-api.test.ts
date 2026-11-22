/**
 * The owner's RMHTube watch statistics API: the session's own row only, pause, clear, and the account export.
 * Prisma is replaced by a small fake that records the calls the module makes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: {
    user: {
      id: 'u1',
    },
    session: {
      id: 's1',
      userId: 'u1',
    },
  } as null | {
    user: {
      id: string;
    };
    session: {
      id: string;
      userId: string;
    };
  },
  statsFindUnique: vi.fn(),
  dayFindMany: vi.fn(),
  statsUpsert: vi.fn(),
  dayDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => h.session),
    },
  },
}));
vi.mock('@/lib/prisma.server', () => {
  const model = (m: Record<string, unknown>) =>
    new Proxy(m, {
      get: (t, k: string) => (k in t ? t[k] : vi.fn(async () => null)),
    });
  return {
    prisma: new Proxy(
      {
        rmhTubeUserStats: model({
          findUnique: h.statsFindUnique,
          upsert: h.statsUpsert,
        }),
        rmhTubeWatchDay: model({
          findMany: h.dayFindMany,
          deleteMany: h.dayDeleteMany,
        }),
        $transaction: h.transaction,
      },
      {
        get: (t, k: string) => (k in t ? (t as Record<string, unknown>)[k] : model({})),
      },
    ),
  };
});

const stats = await import('@/lib/rmhtube/api/rmhtube.stats.server');
const pause = await import('@/lib/rmhtube/api/rmhtube.stats.pause.server');
const { exportRmhTubeStats } = await import('@/lib/rmhtube/stats.server');

let ip = 0;
function request(method: string, path: string, body?: unknown) {
  ip += 1;
  return new Request(`https://rmhstudios.com${path}`, {
    method,
    headers: {
      cookie: 'better-auth.session_token=t',
      'x-forwarded-for': `203.0.113.${ip}`,
      ...(body === undefined
        ? {}
        : {
            'content-type': 'application/json',
          }),
    },
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
        }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.session = {
    user: {
      id: 'u1',
    },
    session: {
      id: 's1',
      userId: 'u1',
    },
  };
  h.statsFindUnique.mockResolvedValue({
    totalWatchTimeMinutes: 125,
    videosWatched: 3,
    roomsCreated: 1,
    roomsJoined: 4,
    messagesSent: 20,
    reactionsUsed: 7,
    paused: false,
  });
  h.dayFindMany.mockResolvedValue([
    {
      day: '2026-11-28',
      minutes: 45,
    },
  ]);
  h.transaction.mockResolvedValue([]);
  h.statsUpsert.mockReturnValue('upsert-op');
  h.dayDeleteMany.mockReturnValue('delete-op');
});

describe('GET /api/rmhtube/stats', () => {
  it('returns the caller’s counters and a zero-filled 30-day window, read by the session id only', async () => {
    const res = await stats.route.handlers.GET!({
      request: request('GET', '/api/rmhtube/stats?userId=someone-else'),
      params: {},
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const body = (await res.json()) as {
      counters: Record<string, number>;
      paused: boolean;
      days: {
        day: string;
        minutes: number;
      }[];
    };
    expect(body.counters).toMatchObject({
      totalWatchTimeMinutes: 125,
      videosWatched: 3,
      roomsJoined: 4,
    });
    expect(body.paused).toBe(false);
    expect(body.days).toHaveLength(30);
    expect(h.statsFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
        },
      }),
    );
    expect(h.dayFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
        }),
      }),
    );
  });

  it('shows zeros for a member with no row yet', async () => {
    h.statsFindUnique.mockResolvedValue(null);
    h.dayFindMany.mockResolvedValue([]);
    const res = await stats.route.handlers.GET!({
      request: request('GET', '/api/rmhtube/stats'),
      params: {},
    });
    const body = (await res.json()) as {
      counters: Record<string, number>;
      days: {
        minutes: number;
      }[];
    };
    expect(Object.values(body.counters).every((n) => n === 0)).toBe(true);
    expect(body.days.every((d) => d.minutes === 0)).toBe(true);
  });

  it('refuses a signed-out caller and reads nothing', async () => {
    h.session = null;
    const res = await stats.route.handlers.GET!({
      request: request('GET', '/api/rmhtube/stats'),
      params: {},
    });
    expect(res.status).toBe(401);
    expect(h.statsFindUnique).not.toHaveBeenCalled();
  });
});

describe('PUT /api/rmhtube/stats/pause', () => {
  it('pauses recording for the caller only', async () => {
    const res = await pause.route.handlers.PUT!({
      request: request('PUT', '/api/rmhtube/stats/pause', {
        paused: true,
      }),
      params: {},
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      paused: true,
    });
    const args = h.statsUpsert.mock.calls[0]![0] as {
      where: unknown;
      create: {
        userId: string;
        paused: boolean;
      };
      update: {
        paused: boolean;
        pausedAt: Date | null;
      };
    };
    expect(args.where).toEqual({
      userId: 'u1',
    });
    expect(args.create).toMatchObject({
      userId: 'u1',
      paused: true,
    });
    expect(args.update.paused).toBe(true);
    expect(args.update.pausedAt).toBeInstanceOf(Date);
  });

  it('resumes and clears pausedAt', async () => {
    await pause.route.handlers.PUT!({
      request: request('PUT', '/api/rmhtube/stats/pause', {
        paused: false,
      }),
      params: {},
    });
    const args = h.statsUpsert.mock.calls[0]![0] as {
      update: {
        paused: boolean;
        pausedAt: Date | null;
      };
    };
    expect(args.update).toEqual({
      paused: false,
      pausedAt: null,
    });
  });

  it('rejects a body that is not { paused: boolean }, and a signed-out caller', async () => {
    const bad = await pause.route.handlers.PUT!({
      request: request('PUT', '/api/rmhtube/stats/pause', {
        paused: 'yes',
        userId: 'u2',
      }),
      params: {},
    });
    expect(bad.status).toBe(400);
    h.session = null;
    const out = await pause.route.handlers.PUT!({
      request: request('PUT', '/api/rmhtube/stats/pause', {
        paused: true,
      }),
      params: {},
    });
    expect(out.status).toBe(401);
    expect(h.statsUpsert).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/rmhtube/stats', () => {
  it('zeroes the counters, stamps clearedAt for the hub, and deletes the day rows, in one transaction', async () => {
    const res = await stats.route.handlers.DELETE!({
      request: request('DELETE', '/api/rmhtube/stats'),
      params: {},
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
    });
    expect(h.transaction).toHaveBeenCalledWith(['upsert-op', 'delete-op']);
    const args = h.statsUpsert.mock.calls[0]![0] as {
      where: unknown;
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(args.where).toEqual({
      userId: 'u1',
    });
    expect(args.update).toMatchObject({
      totalWatchTimeMinutes: 0,
      videosWatched: 0,
      roomsCreated: 0,
      roomsJoined: 0,
      messagesSent: 0,
      reactionsUsed: 0,
    });
    expect(args.update.clearedAt).toBeInstanceOf(Date);
    expect(args.update).not.toHaveProperty('paused');
    expect(args.create.clearedAt).toBeInstanceOf(Date);
    expect(h.dayDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
      },
    });
  });

  it('refuses a signed-out caller', async () => {
    h.session = null;
    const res = await stats.route.handlers.DELETE!({
      request: request('DELETE', '/api/rmhtube/stats'),
      params: {},
    });
    expect(res.status).toBe(401);
    expect(h.transaction).not.toHaveBeenCalled();
  });
});

describe('the profile card stays owner-only', () => {
  it('keeps readRmhTube behind OWNER_ONLY (source scan)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../profile/app-profiles.server.ts', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf('const readRmhTube'), src.indexOf('const readElo'));
    expect(block).toContain('visible: OWNER_ONLY');
  });
});

describe('the account export', () => {
  it('carries the caller’s counters, pause state and kept days, read by the id it is given', async () => {
    h.statsFindUnique.mockResolvedValue({
      totalWatchTimeMinutes: 60,
      videosWatched: 1,
      roomsCreated: 0,
      roomsJoined: 2,
      messagesSent: 3,
      reactionsUsed: 4,
      paused: true,
      pausedAt: new Date('2026-11-20T10:00:00Z'),
      clearedAt: null,
    });
    h.dayFindMany.mockResolvedValue([
      {
        day: '2026-11-27',
        minutes: 60,
      },
    ]);
    const out = await exportRmhTubeStats('u1');
    expect(out).toEqual({
      counters: {
        totalWatchTimeMinutes: 60,
        videosWatched: 1,
        roomsCreated: 0,
        roomsJoined: 2,
        messagesSent: 3,
        reactionsUsed: 4,
      },
      paused: true,
      pausedAt: '2026-11-20T10:00:00.000Z',
      clearedAt: null,
      days: [
        {
          day: '2026-11-27',
          minutes: 60,
        },
      ],
    });
    expect(h.statsFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
        },
      }),
    );
    expect(h.dayFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
        },
      }),
    );
  });
});

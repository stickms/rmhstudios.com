/**
 * RMHTube watch statistics, web tier: the owner's read, pause and clear, plus the account export and erasure.
 *
 * The hub (server/rmhtube/stats-recorder.ts) is the only writer of the counters; everything here is about the
 * viewer's own row, so every function takes the session's `userId` and nothing else identifies a member.
 */
import { prisma } from '@/lib/prisma.server';
import { chartStartDay, zeroFill30, type WatchCounters, type WatchStats } from '@/lib/rmhtube/stats';

const COUNTER_SELECT = {
  totalWatchTimeMinutes: true,
  videosWatched: true,
  roomsCreated: true,
  roomsJoined: true,
  messagesSent: true,
  reactionsUsed: true,
} as const;

const ZERO_COUNTERS: WatchCounters = {
  totalWatchTimeMinutes: 0,
  videosWatched: 0,
  roomsCreated: 0,
  roomsJoined: 0,
  messagesSent: 0,
  reactionsUsed: 0,
};

/** The caller's counters, pause flag and the last 30 UTC days of minutes (zero-filled). One indexed read each. */
export async function getMyStats(userId: string, nowMs: number = Date.now()): Promise<WatchStats> {
  const [row, days] = await Promise.all([
    prisma.rmhTubeUserStats.findUnique({
      where: {
        userId,
      },
      select: {
        ...COUNTER_SELECT,
        paused: true,
      },
    }),
    prisma.rmhTubeWatchDay.findMany({
      where: {
        userId,
        day: {
          gte: chartStartDay(nowMs),
        },
      },
      select: {
        day: true,
        minutes: true,
      },
    }),
  ]);
  const { paused = false, ...counters } = row ?? {
    ...ZERO_COUNTERS,
    paused: false,
  };
  return {
    counters,
    paused,
    days: zeroFill30(Array.isArray(days) ? days : [], nowMs),
  };
}

/** Pause or resume recording. Existing counts stay; the hub re-reads the flag at join and every 60 s. */
export async function setPaused(
  userId: string,
  paused: boolean,
): Promise<{
  paused: boolean;
}> {
  const pausedAt = paused ? new Date() : null;
  await prisma.rmhTubeUserStats.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      paused,
      pausedAt,
    },
    update: {
      paused,
      pausedAt,
    },
    select: {
      userId: true,
    },
  });
  return {
    paused,
  };
}

/**
 * Clear the member's statistics: counters to zero and the per-day rows deleted. `clearedAt` is stamped on the
 * row so the hub drops any delta it accumulated before this instant (it holds up to 60 s in memory).
 */
export async function clearStats(userId: string): Promise<void> {
  const clearedAt = new Date();
  await prisma.$transaction([
    prisma.rmhTubeUserStats.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        clearedAt,
      },
      update: {
        ...ZERO_COUNTERS,
        clearedAt,
      },
      select: {
        userId: true,
      },
    }),
    prisma.rmhTubeWatchDay.deleteMany({
      where: {
        userId,
      },
    }),
  ]);
}

/** The member's own statistics for the account export: counters, pause state and the kept per-day minutes. */
export async function exportRmhTubeStats(userId: string): Promise<{
  counters: WatchCounters;
  paused: boolean;
  pausedAt: string | null;
  clearedAt: string | null;
  days: {
    day: string;
    minutes: number;
  }[];
}> {
  const [row, days] = await Promise.all([
    prisma.rmhTubeUserStats.findUnique({
      where: {
        userId,
      },
      select: {
        ...COUNTER_SELECT,
        paused: true,
        pausedAt: true,
        clearedAt: true,
      },
    }),
    prisma.rmhTubeWatchDay.findMany({
      where: {
        userId,
      },
      orderBy: {
        day: 'asc',
      },
      select: {
        day: true,
        minutes: true,
      },
    }),
  ]);
  const { paused, pausedAt, clearedAt, ...counters } = row ?? {
    ...ZERO_COUNTERS,
    paused: false,
    pausedAt: null,
    clearedAt: null,
  };
  return {
    counters,
    paused,
    pausedAt: pausedAt ? pausedAt.toISOString() : null,
    clearedAt: clearedAt ? clearedAt.toISOString() : null,
    days: Array.isArray(days) ? days : [],
  };
}

/** Operations for `anonymizeAccount`'s transaction: both tables hold only the member's own figures. */
export function rmhTubeStatsErasureOps(userId: string) {
  return [
    prisma.rmhTubeWatchDay.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rmhTubeUserStats.deleteMany({
      where: {
        userId,
      },
    }),
  ];
}

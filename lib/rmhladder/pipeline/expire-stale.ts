export const DEFAULT_JOB_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days

export function resolveJobMaxAgeMs(env: { LADDER_JOB_MAX_AGE_MS?: string } = process.env): number {
  const parsed = Number(env.LADDER_JOB_MAX_AGE_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_JOB_MAX_AGE_MS;
}

/** A job is stale when its last sighting (lastSeenAt, else discoveredAt) is older than the window. */
export function decideAgeExpiry(args: {
  lastSeenAt: Date | null;
  discoveredAt: Date;
  now: Date;
  maxAgeMs: number;
}): boolean {
  const seen = args.lastSeenAt ?? args.discoveredAt;
  return args.now.getTime() - seen.getTime() > args.maxAgeMs;
}

const EXPIRE_CHUNK = 500;

export interface ExpireStalePrisma {
  ladderJob: {
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<Array<{ id: string; lastSeenAt: Date | null; discoveredAt: Date }>>;
    updateMany(args: { where: { id: { in: string[] } }; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  ladderVerification: {
    createMany(args: { data: Array<Record<string, unknown>> }): Promise<{ count: number }>;
  };
}

/**
 * Source-independent backstop: expire active jobs unseen for maxAgeMs. The
 * window is deliberately long (default 30d = 60 missed 12h cycles) so this
 * only fires on genuinely-dead postings, independent of any single source's
 * health — no circuit breaker needed at this horizon.
 */
export async function expireStaleJobs(
  prisma: ExpireStalePrisma,
  opts: { now: Date; maxAgeMs: number },
): Promise<{ expired: number }> {
  const cutoff = new Date(opts.now.getTime() - opts.maxAgeMs);
  const candidates = await prisma.ladderJob.findMany({
    where: {
      status: 'active',
      OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null, discoveredAt: { lt: cutoff } }],
    },
    select: { id: true, lastSeenAt: true, discoveredAt: true },
  });

  // perf: decide in memory, then write in chunks. Every expired job gets the
  // same update payload and a verification row differing only by jobId, so this
  // is two statements per 500 jobs instead of two per job, serially.
  const staleIds = candidates
    .filter((job) =>
      decideAgeExpiry({
        lastSeenAt: job.lastSeenAt,
        discoveredAt: job.discoveredAt,
        now: opts.now,
        maxAgeMs: opts.maxAgeMs,
      }),
    )
    .map((job) => job.id);

  const evidence = `Age backstop: not seen on any board for over ${Math.round(opts.maxAgeMs / (24 * 60 * 60 * 1_000))} days.`;
  for (let i = 0; i < staleIds.length; i += EXPIRE_CHUNK) {
    const ids = staleIds.slice(i, i + EXPIRE_CHUNK);
    await prisma.ladderJob.updateMany({
      where: { id: { in: ids } },
      data: { status: 'expired', lastCheckedAt: opts.now },
    });
    await prisma.ladderVerification.createMany({
      data: ids.map((jobId) => ({ jobId, status: 'expired', confidence: 80, evidence })),
    });
  }
  return { expired: staleIds.length };
}

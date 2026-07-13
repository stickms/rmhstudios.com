import { describe, it, expect } from 'vitest';
import { probeUnconfiguredSources, type ProbePrisma } from './probe-sources';
import { candidateSlugs } from '../adapters/prober';

type AnyRow = Record<string, unknown>;

function makeFakePrisma(sources: AnyRow[]) {
  const updates: AnyRow[] = [];
  const prisma: ProbePrisma = {
    ladderSource: {
      async findMany({ where }: AnyRow) {
        const w = where as AnyRow;
        const platforms = (w.platform as AnyRow).in as string[];
        const statuses = (w.status as AnyRow).in as string[];
        return sources.filter(
          (s) => statuses.includes(s.status as string) && platforms.includes(s.platform as string),
        );
      },
      async update({ where, data }: { where: AnyRow; data: AnyRow }) {
        updates.push({ id: where.id, ...data });
        return {};
      },
    },
  };
  return { prisma, updates };
}

const src = (id: string, companyId: string, name: string, platform: string): AnyRow => ({
  id, companyId, platform, status: 'unconfigured', consecutiveFailures: 0, company: { name },
});

describe('probeUnconfiguredSources', () => {
  it('activates the first live slug and stops probing further candidates', async () => {
    // Two-word name → multiple slug candidates ('testco' alone would yield one)
    const { prisma, updates } = makeFakePrisma([src('s1', 'c1', 'Test Co', 'greenhouse')]);
    const probedSlugs: string[] = [];
    const secondSlug = candidateSlugs('Test Co')[1];

    const result = await probeUnconfiguredSources(prisma, {
      sleepMs: 0,
      probe: async (_plt, slug) => {
        probedSlugs.push(slug);
        return slug === secondSlug ? { live: true, jobCount: 7 } : { live: false, jobCount: 0 };
      },
    });

    expect(result).toEqual({ companiesProbed: 1, sourcesActivated: 1, totalLiveJobs: 7 });
    // stopped right after the live hit — no candidates probed past the second
    expect(probedSlugs).toEqual(candidateSlugs('Test Co').slice(0, 2));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: 's1', slug: secondSlug, status: 'active', consecutiveFailures: 0, nextProbeAt: null,
    });
    expect(updates[0].lastSuccessAt).toBeInstanceOf(Date);
  });

  it('backs off sources when no slug is live', async () => {
    const { prisma, updates } = makeFakePrisma([
      src('s1', 'c1', 'DeadCo', 'greenhouse'),
      src('s2', 'c1', 'DeadCo', 'lever'),
    ]);

    const result = await probeUnconfiguredSources(prisma, {
      sleepMs: 0,
      probe: async () => ({ live: false, jobCount: 0 }),
    });

    expect(result).toEqual({ companiesProbed: 1, sourcesActivated: 0, totalLiveJobs: 0 });
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ id: 's1', consecutiveFailures: 1 });
    expect(updates[0].lastProbedAt).toBeInstanceOf(Date);
    expect(updates[0].nextProbeAt).toBeInstanceOf(Date);
  });

  it('respects the limit and platform filters', async () => {
    const { prisma, updates } = makeFakePrisma([
      src('s1', 'c1', 'Alpha', 'greenhouse'),
      src('s2', 'c1', 'Alpha', 'lever'),
      src('s3', 'c2', 'Beta', 'greenhouse'),
    ]);

    const result = await probeUnconfiguredSources(prisma, {
      sleepMs: 0,
      limit: 1,
      platforms: ['greenhouse'],
      probe: async () => ({ live: true, jobCount: 3 }),
    });

    // one company (limit), greenhouse only (platform filter)
    expect(result).toEqual({ companiesProbed: 1, sourcesActivated: 1, totalLiveJobs: 3 });
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('s1');
  });

  it('uses exponential retry backoff capped at fourteen days', async () => {
    const source = src('s1', 'c1', 'Dead Co', 'greenhouse');
    source.consecutiveFailures = 3;
    const { prisma, updates } = makeFakePrisma([source]);
    const now = new Date('2026-07-12T12:00:00.000Z');

    await probeUnconfiguredSources(prisma, {
      sleepMs: 0,
      now,
      retryAfterMs: 60_000,
      probe: async () => ({ live: false, jobCount: 0 }),
    });

    expect(updates[0]).toMatchObject({ id: 's1', consecutiveFailures: 4 });
    expect(updates[0].nextProbeAt).toEqual(new Date(now.getTime() + 8 * 60_000));
  });

  it('continues after an individual probe throws', async () => {
    const { prisma, updates } = makeFakePrisma([src('s1', 'c1', 'Test Co', 'greenhouse')]);
    let calls = 0;

    const result = await probeUnconfiguredSources(prisma, {
      sleepMs: 0,
      probe: async () => {
        calls++;
        if (calls === 1) throw new Error('temporary failure');
        return { live: true, jobCount: 2 };
      },
    });

    expect(result.sourcesActivated).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'active' });
  });

  it('retries a due error source using its configured slug first and restores active', async () => {
    const source = src('s1', 'c1', 'Different Company Name', 'greenhouse');
    source.status = 'error';
    source.slug = 'known-board';
    source.nextProbeAt = new Date('2026-07-12T08:00:00.000Z');
    const { prisma, updates } = makeFakePrisma([source]);
    const slugs: string[] = [];

    await probeUnconfiguredSources(prisma, {
      sleepMs: 0,
      now: new Date('2026-07-12T12:00:00.000Z'),
      probe: async (_platform, slug) => {
        slugs.push(slug);
        return { live: slug === 'known-board', jobCount: 4 };
      },
    });

    expect(slugs).toEqual(['known-board']);
    expect(updates[0]).toMatchObject({ status: 'active', consecutiveFailures: 0, nextProbeAt: null });
  });
});

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
        return sources.filter(
          (s) => s.status === w.status && platforms.includes(s.platform as string),
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
  id, companyId, platform, status: 'unconfigured', company: { name },
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
    expect(updates[0]).toMatchObject({ id: 's1', slug: secondSlug, status: 'active' });
    expect(updates[0].lastSuccessAt).toBeInstanceOf(Date);
  });

  it('leaves sources untouched when no slug is live', async () => {
    const { prisma, updates } = makeFakePrisma([
      src('s1', 'c1', 'DeadCo', 'greenhouse'),
      src('s2', 'c1', 'DeadCo', 'lever'),
    ]);

    const result = await probeUnconfiguredSources(prisma, {
      sleepMs: 0,
      probe: async () => ({ live: false, jobCount: 0 }),
    });

    expect(result).toEqual({ companiesProbed: 1, sourcesActivated: 0, totalLiveJobs: 0 });
    expect(updates).toHaveLength(0);
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
});

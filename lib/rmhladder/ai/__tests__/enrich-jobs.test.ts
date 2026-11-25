import { describe, expect, it, vi } from 'vitest';
import { shapeChecked } from '@/lib/db/query-shape';
import { enrichRecentLadderJobs, type JobEnrichmentPrisma } from '../enrich-jobs.server';

vi.mock('../provider.server', () => ({ ladderAiProviderConfigured: () => true }));
vi.mock('../job-profile.server', () => ({ ensureCachedJobProfile: vi.fn(async () => ({ cached: true })) }));

describe('enrichRecentLadderJobs', () => {
  it('reads jobs with query shapes the schema accepts (LadderJob has no updatedAt)', async () => {
    const findMany = vi.fn(async () => []);
    const prisma = shapeChecked({ ladderJob: { findMany } }) as unknown as JobEnrichmentPrisma;
    const result = await enrichRecentLadderJobs(prisma, { limit: 5, provider: 'deepseek' });
    expect(result).toMatchObject({ attempted: 0, enriched: 0, skipped: false });
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

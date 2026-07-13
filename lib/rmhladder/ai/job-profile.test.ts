import { describe, expect, it, vi } from 'vitest';
import { ensureCachedJobProfile, extractJobProfileWithAi } from './job-profile.server';
import type { LadderAiProvider } from './provider.server';

const job = {
  id: 'job-1', title: 'Analyst Intern', company: { name: 'Acme' }, locationRaw: 'New York, NY', city: 'New York', state: 'NY',
  remoteStatus: 'hybrid' as const, programType: 'internship', earlyCareerClassification: 'yes',
  descriptionSummary: 'Required: Excel. Preferred: SQL.', fullDescription: 'Required: Excel. Preferred: SQL.',
};

const aiProfile = {
  title: 'Analyst Intern', company: 'Acme', summary: 'Early-career analyst internship.', requiredSkills: ['Excel'], preferredSkills: ['SQL'],
  keywords: ['analyst'], responsibilities: [], minYearsExperience: null, maxYearsExperience: null, educationLevels: [], locations: ['New York, NY'],
  remoteStatus: 'hybrid', programType: 'internship', earlyCareer: true,
};

describe('job profile AI cache', () => {
  it('strictly validates AI extraction and delimits untrusted job text', async () => {
    const completeJson = vi.fn().mockResolvedValue(aiProfile);
    const client: LadderAiProvider = { name: 'deepseek', model: 'test', completeJson };
    const result = await extractJobProfileWithAi(job, { client });
    expect(result.profile.requiredSkills).toEqual(['Excel']);
    expect(completeJson.mock.calls[0][0].prompt).toContain('<job_posting_data>');
    expect(completeJson.mock.calls[0][0].system).toContain('untrusted data');
  });

  it('reuses the shared source-hash cache without calling AI', async () => {
    const upsert = vi.fn();
    const prisma = { ladderJobProfile: { findFirst: vi.fn().mockResolvedValue({ profile: aiProfile }), upsert } };
    const client: LadderAiProvider = { name: 'deepseek', model: 'test', completeJson: vi.fn() };
    const result = await ensureCachedJobProfile(prisma, job, { allowAi: true, client });
    expect(result.title).toBe('Analyst Intern');
    expect(client.completeJson).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('lets the worker upgrade a deterministic cache entry once AI is configured', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      ladderJobProfile: {
        findFirst: vi.fn().mockResolvedValue({ profile: aiProfile, provider: 'deterministic' }),
        upsert,
      },
    };
    const completeJson = vi.fn().mockResolvedValue(aiProfile);
    const client: LadderAiProvider = { name: 'deepseek', model: 'test', completeJson };

    await ensureCachedJobProfile(prisma, job, { allowAi: true, client });

    expect(completeJson).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ provider: 'deepseek', model: 'test' }),
    }));
  });
});

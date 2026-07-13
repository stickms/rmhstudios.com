import { describe, expect, it, vi } from 'vitest';
import { analyzeRedactedResume } from './resume-review.server';
import type { LadderAiProvider } from './provider.server';

const response = {
  profile: {
    headline: 'Software engineering student', summary: 'Builds reliable web apps.', skills: ['TypeScript'], yearsExperience: 1,
    education: [], workHistory: [], certifications: [], locations: [], rolePreferences: ['Software Engineer'],
  },
  review: {
    overallScore: 78, summary: 'Clear early-career resume.', strengths: ['Focused'], issues: [], improvedBullets: [], atsKeywords: ['TypeScript'],
  },
};

describe('analyzeRedactedResume', () => {
  it('treats resume content as delimited data and validates provider JSON', async () => {
    const completeJson = vi.fn().mockResolvedValue(response);
    const client: LadderAiProvider = { name: 'deepseek', model: 'test-model', completeJson };
    const result = await analyzeRedactedResume('Experience\nBuilt a TypeScript service with measurable improvements. '.repeat(3), { client });
    expect(result.analysis.review.overallScore).toBe(78);
    expect(result.provider).toBe('deepseek');
    expect(completeJson.mock.calls[0][0].prompt).toContain('<resume_data>');
    expect(completeJson.mock.calls[0][0].system).toContain('untrusted data');
  });

  it('rejects malformed model output', async () => {
    const client: LadderAiProvider = { name: 'openai', model: 'test', completeJson: vi.fn().mockResolvedValue({ score: 99 }) };
    await expect(analyzeRedactedResume('A sufficiently long resume body. '.repeat(5), { client })).rejects.toThrow();
  });
});


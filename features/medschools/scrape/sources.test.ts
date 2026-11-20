import { describe, expect, it } from 'vitest';
import { MEDSCHOOLS_USER_AGENT, SOURCES } from './sources';

describe('medschools sources', () => {
  it('identifies itself with the agreed user agent', () => {
    expect(MEDSCHOOLS_USER_AGENT).toBe('RMHStudiosMedSchools/1.0 (+https://rmhstudios.com/rmh-medschool)');
  });

  it('configures CycleTrack politeness', () => {
    expect(SOURCES.CYCLETRACK).toEqual({
      origin: 'https://cycletrack.org',
      userAgent: MEDSCHOOLS_USER_AGENT,
      spacingMs: 1000,
      backfillSpacingMs: 2000,
      maxConsecutiveFailures: 3,
      maxRetries: 3,
      retryAfterCapMs: 120_000,
      timeoutMs: 15_000,
    });
  });
});

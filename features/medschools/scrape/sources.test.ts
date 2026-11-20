import { describe, expect, it } from 'vitest';
import { ADMIT_GRAPHQL_PATH, MEDSCHOOLS_USER_AGENT, SOURCES } from './sources';

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

  it('ADMIT politeness matches spec §8', () => {
    expect(SOURCES.ADMIT.origin).toBe('https://api.admit.org');
    expect(SOURCES.ADMIT.spacingMs).toBe(1000);
    expect(SOURCES.ADMIT.backfillSpacingMs).toBe(2000);
    expect(SOURCES.ADMIT.maxConsecutiveFailures).toBe(3);
    expect(SOURCES.ADMIT.userAgent).toBe(MEDSCHOOLS_USER_AGENT);
    expect(SOURCES.ADMIT.headers?.origin).toBe('https://med.admit.org');
    expect(ADMIT_GRAPHQL_PATH).toBe('/graphql');
  });

  it('CYCLETRACK has no extra headers', () => {
    expect(SOURCES.CYCLETRACK.headers).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  ADMIT_GRAPHQL_PATH,
  ADMIT_SECONDARY_URL,
  DAILY_REQUEST_BUDGETS,
  MEDSCHOOLS_USER_AGENT,
  SOURCES,
} from './sources';

describe('medschools sources', () => {
  it('identifies itself with the agreed user agent', () => {
    expect(MEDSCHOOLS_USER_AGENT).toBe('MarlonJack/1.0 (contact: admin@rmhstudios.com)');
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
    expect(SOURCES.ADMIT.backfillSpacingMs).toBe(3000);
    expect(SOURCES.ADMIT.backfillJitterMs).toBe(1000);
    expect(SOURCES.ADMIT.maxConsecutiveFailures).toBe(3);
    expect(SOURCES.ADMIT.userAgent).toBe(MEDSCHOOLS_USER_AGENT);
    expect(SOURCES.ADMIT.headers?.origin).toBe('https://med.admit.org');
    expect(ADMIT_GRAPHQL_PATH).toBe('/graphql');
  });

  it('CYCLETRACK has no extra headers', () => {
    expect(SOURCES.CYCLETRACK.headers).toBeUndefined();
  });

  it('SDN_FORUMS politeness matches the plan', () => {
    expect(SOURCES.SDN_FORUMS.origin).toBe('https://forums.studentdoctor.net');
    expect(SOURCES.SDN_FORUMS.spacingMs).toBeGreaterThanOrEqual(3000);
    expect(SOURCES.SDN_FORUMS.jitterMs).toBeGreaterThan(0);
    expect(SOURCES.SDN_FORUMS.backfillSpacingMs).toBeGreaterThanOrEqual(3000);
    expect(SOURCES.SDN_FORUMS.backfillJitterMs).toBeGreaterThan(0);
    expect(SOURCES.SDN_FORUMS.maxConsecutiveFailures).toBe(3);
    expect(SOURCES.SDN_FORUMS.userAgent).toBe(MEDSCHOOLS_USER_AGENT);
    expect(SOURCES.SDN_FORUMS.headers).toBeUndefined();
  });

  it('SDN_WWW is a separate host config', () => {
    expect(SOURCES.SDN_WWW.origin).toBe('https://www.studentdoctor.net');
    expect(SOURCES.SDN_WWW.spacingMs).toBeGreaterThanOrEqual(1500);
    expect(SOURCES.SDN_WWW.backfillSpacingMs).toBeGreaterThanOrEqual(2000);
    expect(SOURCES.SDN_WWW.userAgent).toBe(MEDSCHOOLS_USER_AGENT);
  });

  it('the two SDN hosts are distinct objects', () => {
    expect(SOURCES.SDN_FORUMS).not.toBe(SOURCES.SDN_WWW);
  });

  it('ADMIT_WEB is a polite, separate host for med.admit.org (secondaries owner rule)', () => {
    const w = SOURCES.ADMIT_WEB;
    expect(w.origin).toBe('https://med.admit.org');
    expect(w.origin).not.toBe(SOURCES.ADMIT.origin);
    expect(w.spacingMs).toBe(3000);
    expect(w.jitterMs).toBe(1000);
    expect(w.backfillSpacingMs).toBe(3000);
    expect(w.backfillJitterMs).toBe(1000);
    expect(w.maxConsecutiveFailures).toBe(3);
    expect(w.userAgent).toBe(MEDSCHOOLS_USER_AGENT);
    expect(w.headers).toBeUndefined();
    expect(SOURCES.ADMIT_WEB).not.toBe(SOURCES.ADMIT);
  });

  it('ADMIT_WEB has a conservative daily budget, about three full runs of the page walk', () => {
    expect(DAILY_REQUEST_BUDGETS.ADMIT_WEB).toBe(700);
    expect(DAILY_REQUEST_BUDGETS.ADMIT_WEB).toBeLessThan(DAILY_REQUEST_BUDGETS.ADMIT);
  });

  it('builds the secondary-essays page URL on the web origin', () => {
    expect(ADMIT_SECONDARY_URL('harvard-medical-school')).toBe(
      'https://med.admit.org/secondary-essays/harvard-medical-school',
    );
  });
});
